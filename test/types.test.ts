import { describe, expect, it } from "vitest";
import {
  isKnownStatus,
  merchantOrderResponseSchema,
  merchantOrderStatusSchema,
  publicTrackingSchema,
  statusChangedEventSchema,
} from "@/lib/swiftdrop/types";

describe("ERP contract schema validation", () => {
  it("parses valid A5.1 Create Order response", () => {
    const raw = {
      parcelId: "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
      trackingNumber: "SD7K3M9Q2XWB",
      status: "CREATED",
      feeAmount: 650.0,
      feeCurrency: "LKR",
      createdAt: "2026-11-14T10:15:30.123Z",
      newlyCreated: true,
    };
    const parsed = merchantOrderResponseSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.feeAmount).toBe("650");
      expect(parsed.data.trackingNumber).toBe("SD7K3M9Q2XWB");
    }
  });

  it("parses valid A5.2 Public Tracking response", () => {
    const raw = {
      trackingNumber: "SD7K3M9Q2XWB",
      status: "IN_TRANSIT",
      pickupCity: "Colombo 10",
      dropoffCity: "Kandy",
      history: [
        { status: "CREATED", occurredAt: "2026-11-14T10:15:30Z" },
        { status: "PICKED_UP", occurredAt: "2026-11-14T12:01:02Z" },
        { status: "IN_TRANSIT", occurredAt: "2026-11-14T13:40:00Z" },
      ],
    };
    const parsed = publicTrackingSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.history).toHaveLength(3);
    }
  });

  it("parses valid A5.3 Webhook event payload", () => {
    const raw = {
      eventId: "0f4b2c1a-9d8e-4f7a-b6c5-d4e3f2a1b0c9",
      eventType: "parcel.status-changed",
      schemaVersion: 1,
      occurredAt: "2026-11-14T12:01:02Z",
      producer: "delivery",
      data: {
        parcelId: "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
        trackingNumber: "SD7K3M9Q2XWB",
        previousStatus: "CREATED",
        newStatus: "PICKED_UP",
        sequence: 2,
        source: "MERCHANT",
        ownerCustomerId: null,
        ownerMerchantId: "77aa0000-0000-0000-0000-000000000000",
        merchantOrderReference: "SLK-10045",
        failureReasonCode: null,
      },
    };
    const parsed = statusChangedEventSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data.newStatus).toBe("PICKED_UP");
      expect(parsed.data.data.sequence).toBe(2);
    }
  });

  it("rejects invalid tracking number formats in create order response", () => {
    const invalid = {
      parcelId: "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
      trackingNumber: "INVALID123", // Does not start with SD or length != 12
      status: "CREATED",
      feeAmount: "650.00",
      feeCurrency: "LKR",
      createdAt: "2026-11-14T10:15:30.123Z",
      newlyCreated: true,
    };
    const parsed = merchantOrderResponseSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  // SwiftDrop routes every parcel through a hub (ADR 0007), so these statuses arrive on every delivery.
  it("parses webhook events with hub statuses", () => {
    const raw = {
      eventId: "0f4b2c1a-9d8e-4f7a-b6c5-d4e3f2a1b0c9",
      eventType: "parcel.status-changed",
      schemaVersion: 1,
      occurredAt: "2026-11-21T09:00:00Z",
      producer: "delivery",
      data: {
        parcelId: "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
        trackingNumber: "SD7K3M9Q2XWB",
        previousStatus: "HUB_ARRIVED",
        newStatus: "HUB_SORTED",
        sequence: 4,
        source: "MERCHANT",
        ownerMerchantId: "77aa0000-0000-0000-0000-000000000000",
        merchantOrderReference: "SLK-10045",
        failureReasonCode: null,
      },
    };
    const parsed = statusChangedEventSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
  });

  const orderStatus = (events: Array<{ sequence: number; status: string; previousStatus: string | null }>) => ({
    parcelId: "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
    trackingNumber: "SD7K3M9Q2XWB",
    merchantOrderReference: "SLK-10045",
    status: events[events.length - 1].status,
    lastSequence: events[events.length - 1].sequence,
    createdAt: "2026-11-21T08:00:00Z",
    events: events.map((e) => ({
      ...e,
      eventId: `0f4b2c1a-9d8e-4f7a-b6c5-d4e3f2a1b0c${e.sequence}`,
      occurredAt: "2026-11-21T09:00:00Z",
      failureReasonCode: null,
    })),
  });

  it("parses the order status API with a hub route", () => {
    const parsed = merchantOrderStatusSchema.safeParse(
      orderStatus([
        { sequence: 1, status: "CREATED", previousStatus: null },
        { sequence: 2, status: "PICKED_UP", previousStatus: "CREATED" },
        { sequence: 3, status: "HUB_ARRIVED", previousStatus: "PICKED_UP" },
        { sequence: 4, status: "HUB_SORTED", previousStatus: "HUB_ARRIVED" },
        { sequence: 5, status: "IN_TRANSIT", previousStatus: "HUB_SORTED" },
        { sequence: 6, status: "HUB_ARRIVED", previousStatus: "IN_TRANSIT" },
        { sequence: 7, status: "OUT_FOR_DELIVERY", previousStatus: "HUB_ARRIVED" },
      ]),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("drops order status events with a status the store does not know, keeping later ones", () => {
    const parsed = merchantOrderStatusSchema.safeParse(
      orderStatus([
        { sequence: 1, status: "CREATED", previousStatus: null },
        { sequence: 2, status: "SOME_FUTURE_STATUS", previousStatus: "CREATED" },
        { sequence: 3, status: "DELIVERED", previousStatus: "SOME_FUTURE_STATUS" },
      ]),
    );
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.events.map((e) => [e.sequence, e.status])).toEqual([
        [1, "CREATED"],
        [3, "DELIVERED"],
      ]);
    }
  });

  it("knows the hub statuses but not invented ones", () => {
    expect(isKnownStatus("HUB_ARRIVED")).toBe(true);
    expect(isKnownStatus("HUB_SORTED")).toBe(true);
    expect(isKnownStatus("SOME_FUTURE_STATUS")).toBe(false);
  });
});
