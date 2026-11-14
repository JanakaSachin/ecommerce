import { describe, expect, it } from "vitest";
import {
  merchantOrderResponseSchema,
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
});

