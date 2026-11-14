import { describe, expect, it } from "vitest";
import { signV1, verifyV1 } from "@/lib/swiftdrop/signature";
import { statusChangedEventSchema } from "@/lib/swiftdrop/types";

describe("webhook processing logic", () => {
  const secret = "0123456789abcdef0123456789abcdef";

  it("verifies webhook signatures and parses payload correctly", () => {
    const rawPayload = JSON.stringify({
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
    });

    const now = Date.now();
    const timestamp = String(Math.floor(now / 1000));
    const sig = signV1(secret, timestamp, rawPayload);

    const sigResult = verifyV1({
      rawBody: rawPayload,
      timestamp,
      signatureHeader: sig,
      secret,
      nowMs: now,
    });

    expect(sigResult.ok).toBe(true);

    const parsed = statusChangedEventSchema.safeParse(JSON.parse(rawPayload));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.data.merchantOrderReference).toBe("SLK-10045");
      expect(parsed.data.data.newStatus).toBe("PICKED_UP");
      expect(parsed.data.data.sequence).toBe(2);
    }
  });

  it("rejects invalid webhook payload schema", () => {
    const malformed = {
      eventId: "not-a-uuid",
      eventType: "parcel.status-changed",
      schemaVersion: 1,
      data: {},
    };
    const parsed = statusChangedEventSchema.safeParse(malformed);
    expect(parsed.success).toBe(false);
  });
});

