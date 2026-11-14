# Developer Log: Phase 4 — Status Updates: Webhooks & Polling Engine

**Project:** StrideLK E-Commerce Store  
**Phase:** Phase 4 (Webhooks & Polling Engine)  
**Date:** 2026-11-14  
**Status:** Completed & Verified ✅  

---

## 1. Overview & Objectives

Phase 4 establishes the dual status synchronization subsystem for StrideLK according to `docs/merchant-integration-plan.md`. Because the ERP does not yet actively broadcast webhooks, polling is the primary live production synchronization channel, while the complete webhook receiver and simulation toolchain are fully implemented and verified so they activate immediately once the ERP webhook sender is deployed.

---

## 2. Directory Structure Established in Phase 4

```
ecommerce/
├── src/
│   ├── app/
│   │   └── api/
│   │       ├── webhooks/
│   │       │   └── swiftdrop/
│   │       │       └── route.ts          # Authenticated HMAC webhook ingestion endpoint
│   │       └── cron/
│   │           └── swiftdrop/
│   │               └── route.ts          # Authenticated cron endpoint (booking & polling)
│   └── lib/
│       └── swiftdrop/
│           ├── webhook.ts                # Webhook audit logging & deduplicated ingestion
│           └── poller.ts                 # Polling service for public tracking view
├── scripts/
│   ├── cron-local.ts                     # Local cron runner (60s tick)
│   └── send-webhook.ts                   # CLI signed webhook simulation script
├── test/
│   └── webhook.test.ts                   # Webhook payload & signature test suite
└── docs/
    ├── developer-1.md                    # Phase 1 documentation
    ├── developer-2.md                    # Phase 2 documentation
    ├── developer-3.md                    # Phase 3 documentation
    ├── developer-4.md                    # Phase 4 documentation (this file)
    ├── phase-development-plan.md         # Updated phase roadmap
    └── merchant-integration-plan.md      # Master blueprint
```

---

## 3. Detailed Components Implemented

### 3.1. Webhook Ingestion & Deduplication (`src/lib/swiftdrop/webhook.ts`)
- **Audit Logging (`logWebhook`):**
  - Logs all incoming webhooks into `WebhookLog` (`rawEventId`, `eventType`, `signatureValid`, `result: "PROCESSED" | "REJECTED" | "IGNORED" | "ERROR"`, `payload`).
  - Wrapped in fail-safe error handling to guarantee audit logging never crashes the HTTP response.
- **Shipment Correlation:**
  - Queries `Shipment` by `merchantOrderReference` first (resolves even if tracking number was not yet committed), falling back to `trackingNumber`.
  - If shipment is unknown: Logs as `IGNORED` and returns HTTP `200` with `{ ok: true, ignored: "unknown shipment" }` so SwiftDrop does not flag the delivery as failed.
- **Transactional Deduplication & Ingestion:**
  - In a single atomic `$transaction`:
    1. Inserts into `WebhookLog` with unique constraint on `eventId`. Catches Prisma `P2002` duplicate key violation and returns HTTP `200` with `{ ok: true, duplicate: true }`.
    2. Backfills `trackingNumber` and `parcelId` on the shipment if not already set.
    3. Calls `applyStatus()` with `source: "WEBHOOK"`, passing `sequence` and `failureReasonCode`.

### 3.2. Webhook API Route (`src/app/api/webhooks/swiftdrop/route.ts`)
- Configured with `runtime = "nodejs"` (for Node.js `crypto` primitives) and `dynamic = "force-dynamic"`.
- Enforces payload size limit of 64 KB (`MAX_BODY_BYTES = 64 * 1024`).
- **Signature Verification:** Reads raw text stream (`req.text()`) and verifies HMAC-SHA256 signature and timestamp before parsing JSON. Rejects invalid signatures with HTTP `401`.
- **Validation:** Validates JSON against `statusChangedEventSchema` and checks `headerEventId === ev.eventId`.
- Filters event types: only processes `parcel.status-changed` with `schemaVersion === 1`; safely acknowledges others with HTTP `200 { ok: true, ignored: true }`.

### 3.3. Public Tracking Poller (`src/lib/swiftdrop/poller.ts`)
- `pollOpenShipments(limit = 50)`:
  - Queries shipments in `state: "BOOKED"` with active tracking numbers where `lastPolledAt` is null or older than `SWIFTDROP_POLL_INTERVAL_SEC`.
  - Dispatches unauthenticated GET requests to `/api/v1/tracked-parcels/{trackingNumber}`.
  - Sorts history chronologically and applies each event sequentially via `applyStatus(..., source: "POLL")`.
  - Always updates `lastPolledAt = now()` even on error to prevent polling storms on failing endpoints.

### 3.4. Background Cron Route & Local Runner
- **Cron Route (`src/app/api/cron/swiftdrop/route.ts`):**
  - Protected with constant-time bearer token validation: `Authorization: Bearer ${CRON_SECRET}`.
  - Triggers `retryDueBookings()` (retrying shipments in `PENDING_BOOKING` whose backoff lease has expired) and `pollOpenShipments()`.
- **Local Runner (`scripts/cron-local.ts`):**
  - Daemon script executed via `npm run cron:local`. Dispatches authenticated GET requests to `/api/cron/swiftdrop` every 60 seconds.

### 3.5. Webhook Simulator (`scripts/send-webhook.ts`)
- Standalone CLI utility executed via `npm run webhook:send -- <merchantRef> <STATUS> [FAILURE_REASON] [trackingNumber]`.
- Constructs valid ADR 0004 v1 event envelopes, computes `v1=` HMAC-SHA256 signatures using `SWIFTDROP_WEBHOOK_SECRET`, and dispatches HTTP POST requests to the webhook route.

---

## 4. Verification & Quality Results

| Verification Check | Command | Result |
|---|---|---|
| **Unit Test Suite** | `npm test` | **12 passed (63/63 tests passing)** |
| **ESLint** | `npm run lint` | **0 errors, 0 warnings** |
| **Next.js Production Build** | `npm run build` | **Compiled successfully (Added `/api/cron/swiftdrop` and `/api/webhooks/swiftdrop` as dynamic routes)** |

---

## 5. Next Steps: Phase 5 Preview

With the status synchronization pipeline established, the project progresses to **Phase 5: Customer Tracking & Admin Dashboard**:
1. `src/app/api/orders/[orderNumber]/status/route.ts`: Secure customer status polling API (sanitized DTO without PII).
2. `src/components/DeliveryTimeline.tsx`: Visual delivery timeline displaying forward progress, gap-filling intermediate steps, and customer-friendly failure text.
3. `src/app/orders/[orderNumber]/page.tsx` & `LiveOrderStatus.tsx`: 10-second auto-polling customer order page.
4. `scripts/sync-zones.ts`: Live zone synchronization tool logging into ERP as merchant user.
5. `/admin`, `/admin/shipments`, `/admin/webhooks`, `/admin/zones`: Admin integration console with manual retry, manual poll, webhook audit viewer, and failure re-shipping action.
