// Webhook Simulator Script for Local Testing (matches SwiftDrop ADR 0004 v1 format)
// Usage: npm run webhook:send -- <merchantRef> <STATUS> [FAILURE_REASON] [trackingNumber]
// e.g.:  npm run webhook:send -- SLK-10045 PICKED_UP
//        npm run webhook:send -- SLK-10045 FAILED RECIPIENT_UNAVAILABLE
import { createHmac, randomUUID } from "crypto";

const [ref, status, reason, tracking] = process.argv.slice(2);
if (!ref || !status) {
  console.error("Usage: npm run webhook:send -- <merchantRef> <STATUS> [FAILURE_REASON] [trackingNumber]");
  console.error("Example: npm run webhook:send -- SLK-10045 PICKED_UP");
  process.exit(1);
}

const SEQ: Record<string, number> = {
  CREATED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 5,
  FAILED: 5,
};

const PREV: Record<string, string | null> = {
  CREATED: null,
  PICKED_UP: "CREATED",
  IN_TRANSIT: "PICKED_UP",
  OUT_FOR_DELIVERY: "IN_TRANSIT",
  DELIVERED: "OUT_FOR_DELIVERY",
  FAILED: "OUT_FOR_DELIVERY",
};

const secret = process.env.SWIFTDROP_WEBHOOK_SECRET;
if (!secret) {
  console.error("Error: SWIFTDROP_WEBHOOK_SECRET is not configured in .env");
  process.exit(1);
}

const eventId = randomUUID();
const body = JSON.stringify({
  eventId,
  eventType: "parcel.status-changed",
  schemaVersion: 1,
  occurredAt: new Date().toISOString(),
  producer: "delivery",
  data: {
    parcelId: randomUUID(),
    trackingNumber: tracking ?? "SD0000000000",
    previousStatus: PREV[status] ?? null,
    newStatus: status,
    sequence: SEQ[status] ?? 1,
    source: "MERCHANT",
    ownerCustomerId: null,
    ownerMerchantId: randomUUID(),
    merchantOrderReference: ref,
    failureReasonCode: status === "FAILED" ? reason ?? "OTHER" : null,
  },
});

const ts = String(Math.floor(Date.now() / 1000));
const sig = "v1=" + createHmac("sha256", secret).update(`${ts}.${body}`, "utf8").digest("hex");

const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100";
const targetUrl = `${baseUrl.replace(/\/+$/, "")}/api/webhooks/swiftdrop`;

console.log(`[simulator] Dispatching signed webhook to ${targetUrl}...`);
console.log(`[simulator] Reference: ${ref}, Status: ${status}, Reason: ${reason ?? "none"}`);

try {
  const res = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-SwiftDrop-Event-Id": eventId,
      "X-SwiftDrop-Event-Type": "parcel.status-changed",
      "X-SwiftDrop-Timestamp": ts,
      "X-SwiftDrop-Signature": sig,
    },
    body,
  });

  const responseText = await res.text();
  console.log(`[simulator] Response: HTTP ${res.status} ${res.statusText}`);
  console.log(`[simulator] Body: ${responseText}`);
} catch (e) {
  console.error(`[simulator] Request failed: ${(e as Error).message}`);
}

