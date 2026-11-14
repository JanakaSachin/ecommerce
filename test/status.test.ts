import { describe, expect, it } from "vitest";
import { shouldMoveTo, isTerminal, shipmentStateFor } from "@/lib/swiftdrop/status";
import type { DeliveryStatus } from "@prisma/client";

describe("status progression rules (shouldMoveTo)", () => {
  // Test cases from implementation guide Part D1
  const cases: Array<{
    current: DeliveryStatus | null;
    next: DeliveryStatus;
    expected: boolean;
    reason: string;
  }> = [
    { current: null, next: "CREATED", expected: true, reason: "initial creation" },
    { current: null, next: "IN_TRANSIT", expected: true, reason: "first news arrived late" },
    { current: "CREATED", next: "PICKED_UP", expected: true, reason: "step 1 to 2 forward" },
    { current: "PICKED_UP", next: "IN_TRANSIT", expected: true, reason: "step 2 to 3 forward" },
    { current: "IN_TRANSIT", next: "OUT_FOR_DELIVERY", expected: true, reason: "step 3 to 4 forward" },
    { current: "OUT_FOR_DELIVERY", next: "DELIVERED", expected: true, reason: "step 4 to delivered" },
    { current: "OUT_FOR_DELIVERY", next: "FAILED", expected: true, reason: "step 4 to failed" },
    { current: "PICKED_UP", next: "FAILED", expected: true, reason: "failed at pickup hub" },
    { current: "IN_TRANSIT", next: "PICKED_UP", expected: false, reason: "backwards (old news)" },
    { current: "IN_TRANSIT", next: "IN_TRANSIT", expected: false, reason: "repeat status" },
    { current: "OUT_FOR_DELIVERY", next: "CREATED", expected: false, reason: "backwards to created" },
    { current: "DELIVERED", next: "FAILED", expected: false, reason: "delivered is final" },
    { current: "DELIVERED", next: "DELIVERED", expected: false, reason: "delivered is final" },
    { current: "FAILED", next: "OUT_FOR_DELIVERY", expected: false, reason: "failed is final (no reopen in v1)" },
    { current: "FAILED", next: "FAILED", expected: false, reason: "failed is final" },
  ];

  for (const { current, next, expected, reason } of cases) {
    it(`${current ?? "null"} -> ${next} should be ${expected} (${reason})`, () => {
      expect(shouldMoveTo(current, next)).toBe(expected);
    });
  }
});

describe("isTerminal", () => {
  it("recognizes DELIVERED and FAILED as terminal", () => {
    expect(isTerminal("DELIVERED")).toBe(true);
    expect(isTerminal("FAILED")).toBe(true);
  });

  it("recognizes in-flight states as non-terminal", () => {
    expect(isTerminal("CREATED")).toBe(false);
    expect(isTerminal("PICKED_UP")).toBe(false);
    expect(isTerminal("IN_TRANSIT")).toBe(false);
    expect(isTerminal("OUT_FOR_DELIVERY")).toBe(false);
    expect(isTerminal(null)).toBe(false);
    expect(isTerminal(undefined)).toBe(false);
  });
});

describe("shipmentStateFor", () => {
  it("maps DeliveryStatus to store ShipmentState", () => {
    expect(shipmentStateFor("DELIVERED")).toBe("DELIVERED");
    expect(shipmentStateFor("FAILED")).toBe("FAILED");
    expect(shipmentStateFor("CREATED")).toBe("BOOKED");
    expect(shipmentStateFor("PICKED_UP")).toBe("BOOKED");
    expect(shipmentStateFor("IN_TRANSIT")).toBe("BOOKED");
    expect(shipmentStateFor("OUT_FOR_DELIVERY")).toBe("BOOKED");
  });
});

