import { describe, expect, it } from "vitest";
import { shouldMoveTo, isTerminal, shipmentStateFor, STATUS_LABELS } from "@/lib/swiftdrop/status";
import { buildTimeline, isFinal, statusBadge, type OrderStatusDTO } from "@/lib/tracking";
import { PARCEL_STATUSES } from "@/lib/swiftdrop/types";
import type { DeliveryStatus } from "@prisma/client";

describe("status progression rules (shouldMoveTo)", () => {
  // SwiftDrop numbers every status change of a parcel (CREATED = 1); only a higher sequence wins.
  const cases: Array<{
    current: DeliveryStatus | null;
    lastSequence: number;
    nextSequence: number;
    expected: boolean;
    reason: string;
  }> = [
    { current: null, lastSequence: 0, nextSequence: 1, expected: true, reason: "initial creation" },
    { current: null, lastSequence: 0, nextSequence: 3, expected: true, reason: "first news arrived late" },
    { current: "CREATED", lastSequence: 1, nextSequence: 2, expected: true, reason: "next step" },
    { current: "IN_TRANSIT", lastSequence: 3, nextSequence: 4, expected: true, reason: "next step" },
    { current: "OUT_FOR_DELIVERY", lastSequence: 4, nextSequence: 5, expected: true, reason: "delivered or failed" },
    { current: "CREATED", lastSequence: 1, nextSequence: 2, expected: true, reason: "seller pauses the delivery" },
    { current: "PAUSED", lastSequence: 2, nextSequence: 3, expected: true, reason: "seller releases the hold (back to CREATED)" },
    { current: "CREATED", lastSequence: 3, nextSequence: 4, expected: true, reason: "paused again after a release" },
    { current: "PAUSED", lastSequence: 2, nextSequence: 3, expected: true, reason: "seller cancels while paused" },
    { current: "IN_TRANSIT", lastSequence: 3, nextSequence: 2, expected: false, reason: "older news arrives late" },
    { current: "IN_TRANSIT", lastSequence: 3, nextSequence: 3, expected: false, reason: "duplicate event" },
    { current: "PAUSED", lastSequence: 2, nextSequence: 1, expected: false, reason: "stale CREATED must not undo a hold" },
    { current: "DELIVERED", lastSequence: 5, nextSequence: 6, expected: false, reason: "delivered is final" },
    { current: "FAILED", lastSequence: 5, nextSequence: 6, expected: false, reason: "failed is final (no reopen in v1)" },
    { current: "CANCELLED", lastSequence: 3, nextSequence: 4, expected: false, reason: "cancelled is final" },
  ];

  for (const { current, lastSequence, nextSequence, expected, reason } of cases) {
    it(`${current ?? "null"} (#${lastSequence}) -> #${nextSequence} should be ${expected} (${reason})`, () => {
      expect(shouldMoveTo(current, lastSequence, nextSequence)).toBe(expected);
    });
  }
});

describe("isTerminal", () => {
  it("recognizes DELIVERED, FAILED and CANCELLED as terminal", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
  });

  it("recognizes in-flight and held states as non-terminal", () => {
    expect(isTerminal("CREATED")).toBe(false);
    expect(isTerminal("PICKED_UP")).toBe(false);
    expect(isTerminal("IN_TRANSIT")).toBe(false);
    expect(isTerminal("OUT_FOR_DELIVERY")).toBe(false);
    expect(isTerminal("PAUSED")).toBe(false);
    expect(isTerminal(null)).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});

describe("shipmentStateFor", () => {
  it("maps DeliveryStatus to store ShipmentState", () => {
    expect(shipmentStateFor("DELIVERED")).toBe("DELIVERED");
    expect(shipmentStateFor("FAILED")).toBe("FAILED");
    expect(shipmentStateFor("CANCELLED")).toBe("CANCELLED");
    expect(shipmentStateFor("CREATED")).toBe("BOOKED");
    expect(shipmentStateFor("PICKED_UP")).toBe("BOOKED");
    expect(shipmentStateFor("IN_TRANSIT")).toBe("BOOKED");
    expect(shipmentStateFor("OUT_FOR_DELIVERY")).toBe("BOOKED");
  });

  it("keeps a held delivery open so it is still polled", () => {
    expect(shipmentStateFor("PAUSED")).toBe("BOOKED");
  });
});

describe("status vocabulary", () => {
  it("has a customer-facing label for every status SwiftDrop can report", () => {
    for (const status of PARCEL_STATUSES) {
      expect(STATUS_LABELS[status], status).toBeTruthy();
    }
  });
});

function dto(deliveryStatus: string, state: string, statuses: string[]): OrderStatusDTO {
  return {
    orderNumber: 10045,
    shipment: {
      attempt: 1,
      state: state as NonNullable<OrderStatusDTO["shipment"]>["state"],
      trackingNumber: "SD0000000001",
      deliveryStatus,
      failureReason: null,
      events: statuses.map((status, i) => ({
        status,
        failureReason: null,
        occurredAt: new Date(Date.UTC(2026, 10, 15, 10, i)).toISOString(),
      })),
    },
  };
}

describe("timeline for held and cancelled deliveries", () => {
  it("shows a held delivery as the current step, with the remaining steps still ahead", () => {
    const steps = buildTimeline(dto("PAUSED", "BOOKED", ["CREATED", "PAUSED"]));
    expect(steps.map((s) => s.status)).toEqual([
      "CREATED",
      "PAUSED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "held",
      "upcoming",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
  });

  it("returns to the normal steps after a hold is released", () => {
    const steps = buildTimeline(dto("CREATED", "BOOKED", ["CREATED", "PAUSED", "CREATED"]));
    expect(steps.map((s) => s.status)).toEqual([
      "CREATED",
      "PICKED_UP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(steps[0].state).toBe("current");
  });

  it("ends a cancelled delivery right after booking", () => {
    const steps = buildTimeline(dto("CANCELLED", "CANCELLED", ["CREATED", "CANCELLED"]));
    expect(steps.map((s) => [s.status, s.state])).toEqual([
      ["CREATED", "done"],
      ["CANCELLED", "cancelled"],
    ]);
  });
});

describe("final states and badges", () => {
  it("treats CANCELLED as final but PAUSED as still open", () => {
    expect(isFinal("CANCELLED")).toBe(true);
    expect(isFinal(dto("CANCELLED", "CANCELLED", ["CREATED", "CANCELLED"]))).toBe(true);
    expect(isFinal("PAUSED")).toBe(false);
    expect(isFinal(dto("PAUSED", "BOOKED", ["CREATED", "PAUSED"]))).toBe(false);
  });

  it("labels held and cancelled deliveries for the customer", () => {
    expect(statusBadge("BOOKED", "PAUSED").label).toBe("On hold");
    expect(statusBadge("CANCELLED", "CANCELLED").label).toBe("Cancelled");
  });
});
