import { describe, expect, it, beforeEach } from "vitest";
import { buildCreateRequest } from "@/lib/swiftdrop/booking";
import type { Order, Shipment } from "@prisma/client";

describe("booking create request builder (buildCreateRequest)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STORE_ORDER_REF_PREFIX = "SLK";
    process.env.SWIFTDROP_MODE = "mock";
    process.env.SWIFTDROP_WEBHOOK_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.STORE_PICKUP_NAME = "StrideLK Central Warehouse";
    process.env.STORE_PICKUP_PHONE = "+94110000000";
    process.env.STORE_PICKUP_LINE1 = "12 Warehouse Road";
    process.env.STORE_PICKUP_CITY = "Colombo 10";
    process.env.STORE_PICKUP_ZONE_ID = "00000000-0000-4000-8000-000000000001";
    process.env.STORE_PICKUP_POSTAL_CODE = "01000";
  });

  it("constructs valid CreateMerchantOrderRequest from shipment and order snapshot", () => {
    const order: Order = {
      id: "order-123",
      orderNumber: 10045,
      userId: "user-1",
      email: "kumari@example.com",
      customerName: "Kumari Silva",
      phone: "+94711234567",
      line1: "4 Lake View",
      line2: "Off Peradeniya Rd",
      city: "Kandy",
      district: "Kandy",
      postalCode: "20000",
      notes: "Please call on arrival",
      subtotal: 12500,
      deliveryFee: 500,
      total: 13000,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const shipment: Shipment = {
      id: "shipment-123",
      orderId: "order-123",
      attempt: 1,
      merchantRef: "SLK-10045",
      state: "PENDING_BOOKING",
      dropoffZoneId: "00000000-0000-4000-8000-000000000002",
      parcelSize: "MEDIUM",
      weightGrams: 2500,
      description: "Shoes x2 (order #10045)",
      parcelId: null,
      trackingNumber: null,
      deliveryStatus: null,
      failureReason: null,
      courierFee: null,
      bookedAt: null,
      bookingAttempts: 0,
      nextBookingAt: new Date(),
      bookingLeaseUntil: null,
      lastBookingError: null,
      lastPolledAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const req = buildCreateRequest({ ...shipment, order });

    expect(req.merchantOrderReference).toBe("SLK-10045");
    expect(req.pickup.contactName).toBe("StrideLK Central Warehouse");
    expect(req.pickup.phone).toBe("+94110000000");
    expect(req.pickup.city).toBe("Colombo 10");
    expect(req.pickup.zoneId).toBe("00000000-0000-4000-8000-000000000001");
    expect(req.dropoff.contactName).toBe("Kumari Silva");
    expect(req.dropoff.phone).toBe("+94711234567");
    expect(req.dropoff.city).toBe("Kandy");
    expect(req.dropoff.zoneId).toBe("00000000-0000-4000-8000-000000000002");
    expect(req.size).toBe("MEDIUM");
    expect(req.weightGrams).toBe(2500);
    expect(req.description).toBe("Shoes x2 (order #10045)");
  });
});
