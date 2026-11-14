import { describe, expect, it } from "vitest";
import { mockClient, fakeParcel } from "@/lib/swiftdrop/mock";
import { SwiftDropError } from "@/lib/swiftdrop/errors";
import type { CreateMerchantOrderRequest } from "@/lib/swiftdrop/types";

describe("mock SwiftDrop client", () => {
  const req: CreateMerchantOrderRequest = {
    merchantOrderReference: "SLK-TEST-9901",
    pickup: {
      contactName: "Warehouse",
      phone: "+94110000000",
      line1: "12 Warehouse Rd",
      line2: null,
      city: "Colombo 10",
      zoneId: "00000000-0000-4000-8000-000000000001",
      postalCode: "01000",
    },
    dropoff: {
      contactName: "Test Buyer",
      phone: "+94711234567",
      line1: "4 Lake View",
      line2: null,
      city: "Kandy",
      zoneId: "00000000-0000-4000-8000-000000000002",
      postalCode: "20000",
    },
    size: "SMALL",
    weightGrams: 1400,
    description: "Shoes x1",
  };

  it("generates deterministic parcel details matching ERP format", () => {
    const parcel1 = fakeParcel("SLK-MOCK-1");
    const parcel2 = fakeParcel("SLK-MOCK-1");

    expect(parcel1.parcelId).toBe(parcel2.parcelId);
    expect(parcel1.trackingNumber).toBe(parcel2.trackingNumber);
    expect(parcel1.trackingNumber).toMatch(/^SD[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(parcel1.status).toBe("CREATED");
    expect(parcel1.feeCurrency).toBe("LKR");
  });

  it("creates order and returns newlyCreated: true on first call, false on replay", async () => {
    const res1 = await mockClient.createOrder({
      ...req,
      merchantOrderReference: "SLK-UNIQUE-101",
    });
    expect(res1.newlyCreated).toBe(true);
    expect(res1.trackingNumber).toMatch(/^SD[0-9A-HJKMNP-TV-Z]{10}$/);

    // Replay call with exact same reference
    const res2 = await mockClient.createOrder({
      ...req,
      merchantOrderReference: "SLK-UNIQUE-101",
    });
    expect(res2.newlyCreated).toBe(false);
    expect(res2.parcelId).toBe(res1.parcelId);
    expect(res2.trackingNumber).toBe(res1.trackingNumber);
  });

  it("throws RETRYABLE 503 error when SWIFTDROP_MOCK_FAIL is true", async () => {
    process.env.SWIFTDROP_MOCK_FAIL = "true";
    try {
      await expect(mockClient.createOrder(req)).rejects.toThrow(SwiftDropError);
    } finally {
      delete process.env.SWIFTDROP_MOCK_FAIL;
    }
  });

  it("returns null for getTracking in mock mode", async () => {
    const tracking = await mockClient.getTracking("SD7K3M9Q2XWB");
    expect(tracking).toBeNull();
  });
});

