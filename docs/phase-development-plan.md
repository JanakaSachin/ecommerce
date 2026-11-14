# SwiftDrop Merchant Integration: Phase Development Plan

**Project:** StrideLK E-Commerce Store  
**Courier Partner:** SwiftDrop ERP  
**Reference Specification:** `docs/merchant-integration-plan.md`  
**Execution Strategy:** Mock-first modular development followed by Live ERP verification.

---

## High-Level Roadmap

```
Phase 1: Environment, DB & Project Setup (Ports 3100 / 5434, Prisma schema, Seeds)  [COMPLETED ✅]
   ▼
Phase 2: Domain Utilities & SwiftDrop Abstraction (Types, Status rules, Mock/Live clients, Vitest) [COMPLETED ✅]
   ▼
Phase 3: Core Transaction Pipeline & Order Booking (applyStatus, booking service, Checkout action) [COMPLETED ✅]
   ▼
Phase 4: Status Updates — Webhooks & Polling (HMAC verification, poller, cron route, simulator) [COMPLETED ✅]
   ▼
Phase 5: Customer Tracking & Admin Dashboard (Order timeline UI, zone sync, admin reship) [COMPLETED ✅]
   ▼
Phase 6: Live ERP Integration & E2E Verification (Seed zones SQL, API key, courier flow) [READY TO IMPLEMENT ⏳]
```

---

## Five Non-Negotiable Invariants

1. **Save First, Call ERP Second:** Orders and shipments are committed to the store database before contacting SwiftDrop. If SwiftDrop is unreachable, orders remain safe in `PENDING_BOOKING` and are retried asynchronously with backoff.
2. **Strict Module Boundary:** Only `src/lib/swiftdrop/` interacts with or knows SwiftDrop schemas, endpoints, and headers. UI and server actions use internal domain models.
3. **Single Status Mutation Hub:** `applyStatus()` inside a database transaction is the **only** code that mutates `shipment.deliveryStatus`, `shipment.state`, and appends to `DeliveryEvent`.
4. **Strict Forward Progression:** Statuses advance only forward by lifecycle rank (`CREATED` (1) → `PICKED_UP` (2) → `IN_TRANSIT` (3) → `OUT_FOR_DELIVERY` (4) → `DELIVERED` / `FAILED` (9)). Terminal states cannot be changed or re-opened.
5. **Zero Secret Leakage:** `SWIFTDROP_API_KEY`, `SWIFTDROP_WEBHOOK_SECRET`, and `CRON_SECRET` remain strictly on the server (`import "server-only"`). Never expose to the browser, database, or client logs.

---

## Phase Details & Execution Checklist

### Phase 1: Environment, DB & Project Setup
**Status:** Completed ✅ (Detailed report in [`docs/developer-1.md`](./developer-1.md))

- [x] **Step 1.1:** Initialize Next.js 15 project (`package.json`, `@prisma/client@6`, `zod@^4`, `vitest@5`, `bcryptjs`, `jose`, `server-only`).
- [x] **Step 1.2:** Store PostgreSQL database container setup (`compose.yaml` running `postgres:17-alpine` on port `5434`).
- [x] **Step 1.3:** Environment validation schema (`src/lib/env.ts`, `.env.example`, `.env`).
- [x] **Step 1.4:** Relational database schema & migrations (`prisma/schema.prisma`, migration `20261114095202_init`).
- [x] **Step 1.5:** Database seeder (`prisma/seed.ts` populating admin user, catalog, 9 province zones, 25 district mappings, delivery rates).
- [x] **Step 1.6:** Baseline verification (`npm test`, `npm run lint`, and `npm run build` all passing).

---

### Phase 2: Domain Utilities & SwiftDrop Abstraction
**Status:** Completed ✅ (Detailed report in [`docs/developer-2.md`](./developer-2.md))

- [x] **Step 2.1:** ERP contract types & Zod schemas (`src/lib/swiftdrop/types.ts`).
  - Request/response schemas: `CreateMerchantOrderRequest`, `MerchantOrderResponse`, `PublicTracking`, `StatusChangedEvent`.
- [x] **Step 2.2:** Pure domain helpers:
  - `src/lib/swiftdrop/reference.ts`: Deterministic reference generation (`merchantRefFor(orderNumber, attempt)`).
  - `src/lib/swiftdrop/parcel.ts`: Shoe count to parcel sizing & weight calculation (`parcelFor(pairs)`).
  - `src/lib/phone.ts`: Sri Lankan phone number sanitization to `+94XXXXXXXXX` (`normalizeLkPhone`).
  - `src/lib/swiftdrop/zones.ts`: Zone lookup and tiered customer delivery fee calculation.
  - `src/lib/validation.ts`: Checkout & registration schemas with normalized phone and postal code.
- [x] **Step 2.3:** Status transition state machine (`src/lib/swiftdrop/status.ts`).
  - Rank-based forward validation (`shouldMoveTo(current, next)`).
  - Terminal state validation (`isTerminal(status)`).
  - Human-friendly customer status labels and failure descriptions.
- [x] **Step 2.4:** Error classification & client interface (`src/lib/swiftdrop/errors.ts`, `src/lib/swiftdrop/client.ts`).
  - Error classification into `AUTH`, `RETRYABLE`, and `REJECTED`.
  - Client interface declaring `createOrder` and `getTracking`.
- [x] **Step 2.5:** Mock SwiftDrop client (`src/lib/swiftdrop/mock.ts`).
  - Deterministic tracking number generator (`SD` + 10 characters).
  - Safe replay handling (`newlyCreated: false`).
  - Fault injection toggle via `SWIFTDROP_MOCK_FAIL=true`.
- [x] **Step 2.6:** Live SwiftDrop HTTP client (`src/lib/swiftdrop/live.ts`).
  - `POST /api/v1/merchant-api/orders` with `X-API-Key` and timeout signal.
  - `GET /api/v1/tracked-parcels/{trackingNumber}` (public tracking).
  - RFC 9457 Problem Details error parsing.
- [x] **Step 2.7:** HMAC-SHA256 signature verification & signing (`src/lib/swiftdrop/signature.ts`).
- [x] **Step 2.8:** Vitest unit test suite covering signature, status rules, reference generation, parcel sizing, phone normalization, mock client, and schemas.
- **Check:** `npm test` passed 10/10 test files (60/60 tests); `npm run lint` 0 errors/0 warnings; `npm run build` compiled successfully. ✅

---

### Phase 3: Core Transaction Pipeline & Order Booking
**Status:** Completed ✅ (Detailed report in [`docs/developer-3.md`](./developer-3.md))

- [x] **Step 3.1:** State mutation engine (`src/lib/swiftdrop/apply-status.ts`).
  - Row locking via `SELECT ... FOR UPDATE` to avoid webhook/poller race conditions.
  - Append-only delivery timeline event creation with duplicate skipping.
  - Status progression updating shipment state (`BOOKED`, `DELIVERED`, `FAILED`).
- [x] **Step 3.2:** Shipment booking service (`src/lib/swiftdrop/booking.ts`).
  - `buildCreateRequest`: Prepares ERP order payload from shipment and order snapshot.
  - `bookShipment`: Leases shipment (60s lease), invokes client, records tracking number or schedules backoff retry.
  - `retryDueBookings`: Processes due retryable shipments.
- [x] **Step 3.3:** Store core components porting.
  - Session and authentication (`src/lib/session.ts`, `src/app/actions/auth.ts`, `src/lib/jwt.ts`).
  - Shopping cart (`src/lib/cart.ts`, `src/app/actions/cart.ts`).
  - Route protection & access (`src/middleware.ts`, `src/lib/order-access.ts`, `src/lib/catalog.ts`).
- [x] **Step 3.4:** Checkout server action (`src/app/actions/checkout.ts`).
  - Atomic transaction: Stock reservation + Order creation + Shipment creation (`PENDING_BOOKING`).
  - Background asynchronous dispatch via Next.js `after(() => bookShipment(shipmentId))`.
- [x] **Step 3.5:** Checkout UI adjustments (`src/components/CheckoutForm.tsx`).
  - Remove express delivery; validate phone format and postal code; dynamic fee recalculation.
- **Check:** `npm test` passed 11/11 test files (61/61 tests); `npm run lint` passed; `npm run build` compiled successfully. ✅

---

### Phase 4: Status Updates — Webhooks & Polling
**Status:** Completed ✅ (Detailed report in [`docs/developer-4.md`](./developer-4.md))

- [x] **Step 4.1:** HMAC-SHA256 signature verification (`src/lib/swiftdrop/signature.ts`).
  - `signV1` and `verifyV1` with 5-minute replay tolerance window and `timingSafeEqual`.
- [x] **Step 4.2:** Webhook handler & deduplication (`src/lib/swiftdrop/webhook.ts`).
  - Raw event logging in `WebhookLog`.
  - Transactional event claim on unique `eventId`.
  - Forward status update via `applyStatus`.
- [x] **Step 4.3:** Webhook API endpoint (`src/app/api/webhooks/swiftdrop/route.ts`).
  - Node.js runtime, raw body stream reading (`req.text()`), 64KB limit, signature verification.
- [x] **Step 4.4:** Tracking poller service (`src/lib/swiftdrop/poller.ts`).
  - Queries active shipments past polling interval; fetches public tracking; chronologically applies history.
- [x] **Step 4.5:** Cron endpoint & local runner (`src/app/api/cron/swiftdrop/route.ts`, `scripts/cron-local.ts`).
  - Authenticated endpoint invoking `retryDueBookings` and `pollOpenShipments`.
- [x] **Step 4.6:** Webhook simulation script (`scripts/send-webhook.ts`).
  - CLI script generating signed webhook payloads to simulate ERP status changes.
- **Check:** `npm test` passed 12/12 test files (63/63 tests); `npm run lint` passed; `npm run build` compiled `/api/webhooks/swiftdrop` and `/api/cron/swiftdrop` successfully. ✅

---

### Phase 5: Customer Tracking & Admin Dashboard
**Status:** Completed ✅ (Detailed report in [`docs/developer-5.md`](./developer-5.md))

- [x] **Step 5.1:** Customer status API (`src/app/api/orders/[orderNumber]/status/route.ts`).
  - Secure, sanitized DTO returning tracking number, status, and event timeline without PII.
- [x] **Step 5.2:** Customer tracking timeline UI (`src/components/DeliveryTimeline.tsx`, `/orders/[orderNumber]/page.tsx`).
  - Step progression display with visual gap-filling for missed polling steps; 10s auto-refresh polling.
- [x] **Step 5.3:** Zone synchronization script (`scripts/sync-zones.ts`).
  - Logs into ERP with merchant credentials, syncs active zones to `DeliveryZone`, and maps districts.
- [x] **Step 5.4:** Admin integration console (`/admin`, `/admin/shipments`, `/admin/webhooks`, `/admin/zones`).
  - Health dashboard with `AUTH` red banner alert.
  - Shipment operations: Manual "Retry Booking", "Poll Now", and "Simulate Status".
  - Webhook audit log inspector.
- [x] **Step 5.5:** Failure re-shipping workflow (`src/app/actions/admin.ts`).
  - Re-ships failed orders by creating a new shipment with an incremented attempt (`SLK-10045-2`).
- **Check:** Customer timeline updates live; admin console can trigger retries and re-shipping. ✅

---

### Phase 6: Live ERP Integration & End-to-End Verification
**Status:** Pending

- [ ] **Step 6.1:** SwiftDrop ERP local instance verification.
  - Verify Spring Boot ERP on `http://localhost:8080/actuator/health`.
- [ ] **Step 6.2:** Seed ERP database with zones & pricing (`scripts/erp-seed-zones.sql`).
  - Insert 9 province zones and cross-zone pricing matrix into ERP PostgreSQL.
- [ ] **Step 6.3:** Merchant onboarding & API credentials.
  - Register merchant account `StrideLK`; approve via ERP admin; generate live `sd_live_...` API key.
  - Register webhook URL and secret in ERP merchant settings.
  - Switch store `.env` to `SWIFTDROP_MODE=live`.
- [ ] **Step 6.4:** Full manual end-to-end delivery walkthrough.
  - Place order -> Parcel created in ERP -> Assign courier -> Transition through `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED` (with proof).
  - Verify store poller reflects full courier journey in store UI.
- [ ] **Step 6.5:** Final acceptance checklist sign-off (Part D3 in integration plan).
- **Check:** All 12 acceptance criteria pass in live mode.
