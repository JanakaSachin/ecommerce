# Developer Log: Phase 2 — Domain Utilities & SwiftDrop Abstraction Layer

**Project:** StrideLK E-Commerce Store  
**Phase:** Phase 2 (Domain Utilities & Abstraction Layer)  
**Date:** 2026-11-14  
**Status:** Completed & Verified ✅  

---

## 1. Overview & Objectives

Phase 2 builds the core business domain logic and the SwiftDrop ERP abstraction layer for StrideLK in accordance with `docs/merchant-integration-plan.md`. This layer isolates all courier-specific wire protocols, status progression state machines, error classification, HMAC signature verification, and client interfaces behind clean, testable domain abstractions.

---

## 2. Directory Structure Established in Phase 2

```
ecommerce/
├── src/
│   └── lib/
│       ├── phone.ts                      # Sri Lankan phone number sanitization
│       ├── validation.ts                 # Form & checkout Zod schemas
│       └── swiftdrop/
│           ├── types.ts                  # Wire contract types & Zod schemas
│           ├── reference.ts              # Idempotent merchant order reference generator
│           ├── parcel.ts                 # Parcel size & weight calculations
│           ├── zones.ts                  # Zone resolution & customer delivery fee lookup
│           ├── status.ts                 # Lifecycle state machine & forward ranking
│           ├── errors.ts                 # Failure taxonomy (AUTH, RETRYABLE, REJECTED)
│           ├── client.ts                 # SwiftDropClient interface & factory
│           ├── live.ts                   # Production HTTP client (Problem Details RFC 9457)
│           ├── mock.ts                   # In-memory deterministic mock client
│           └── signature.ts              # HMAC-SHA256 (v1) verification & signing
├── test/
│   ├── env.test.ts                       # Environment parsing tests
│   ├── signature.test.ts                 # HMAC v1 verification suite
│   ├── status.test.ts                    # Forward-only lifecycle rule suite
│   ├── parcel.test.ts                    # Sizing & weight calculation tests
│   ├── phone.test.ts                     # Phone normalization tests
│   ├── reference.test.ts                 # Deterministic reference formatting tests
│   ├── errors.test.ts                    # Error classification tests
│   ├── mock.test.ts                      # Mock client & idempotency tests
│   ├── types.test.ts                     # ERP schema compliance tests
│   └── validation.test.ts                # Checkout & register validation tests
└── docs/
    ├── developer-1.md                    # Phase 1 documentation
    ├── developer-2.md                    # Phase 2 documentation (this file)
    ├── phase-development-plan.md         # Updated phase tracker
    └── merchant-integration-plan.md      # Master blueprint
```

---

## 3. Detailed Components Implemented

### 3.1. ERP Contract Types & Zod Schemas (`src/lib/swiftdrop/types.ts`)
- Defined strictly typed status constants (`PARCEL_STATUSES`: `CREATED`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED`).
- Defined failure reasons (`FAILURE_REASONS`: `RECIPIENT_UNAVAILABLE`, `ADDRESS_NOT_FOUND`, `REFUSED`, `DAMAGED`, `OTHER`).
- Defined request interfaces: `MerchantOrderAddress`, `CreateMerchantOrderRequest`.
- Defined wire response validation schemas:
  - `merchantOrderResponseSchema`: Validates flat response `{ parcelId, trackingNumber, status, feeAmount, feeCurrency, createdAt, newlyCreated }` with Base32 tracking number format (`/^SD[0-9A-HJKMNP-TV-Z]{10}$/`).
  - `publicTrackingSchema`: Validates unauthenticated tracking view with chronological history array.
  - `statusChangedEventSchema`: Validates webhook envelope (`eventId`, `eventType: "parcel.status-changed"`, `occurredAt`, `producer`, `data`).

### 3.2. Pure Domain Helpers
- **Phone Normalization (`src/lib/phone.ts`):**
  - Canonicalizes formats (`0711234567`, `+94 71 123 4567`, `94711234567`, `0094...`, `71...`) to `+94XXXXXXXXX`.
  - Rejects foreign, malformed, or invalid length numbers.
- **Reference Generation (`src/lib/swiftdrop/reference.ts`):**
  - First attempt: `${STORE_ORDER_REF_PREFIX}-${orderNumber}` (e.g. `SLK-10045`).
  - Subsequent attempts: `${STORE_ORDER_REF_PREFIX}-${orderNumber}-${attempt}` (e.g. `SLK-10045-2`).
  - Guaranteed deterministic to support safe retry idempotency in SwiftDrop.
- **Parcel Sizing & Weight (`src/lib/swiftdrop/parcel.ts`):**
  - 1 pair: `SMALL` (1,400g).
  - 2–4 pairs: `MEDIUM` (2,500g – 4,700g).
  - 5–20 pairs: `LARGE` (5,800g – 22,300g).
  - Hard cap at 20 pairs (22.3 kg) to remain under SwiftDrop's 30 kg parcel weight ceiling.
- **Zone & Delivery Fee Lookup (`src/lib/swiftdrop/zones.ts`):**
  - `zoneForDistrict(district)`: Queries active province zone for customer district.
  - `customerDeliveryFee(zoneId, size)`: Resolves customer rate from `DeliveryRate` table, falling back to 700 LKR.
- **Validation Schemas (`src/lib/validation.ts`):**
  - Updated `checkoutSchema` removing obsolete `deliveryType`, enforcing normalized phone, district membership, and bounded text lengths.

### 3.3. Lifecycle State Machine (`src/lib/swiftdrop/status.ts`)
- Implemented lifecycle ranking table (`CREATED: 1`, `PICKED_UP: 2`, `IN_TRANSIT: 3`, `OUT_FOR_DELIVERY: 4`, `DELIVERED: 9`, `FAILED: 9`).
- `shouldMoveTo(current, next)`:
  - Current null transitions to any valid initial state.
  - Terminal states (`DELIVERED`, `FAILED`) reject any further transitions.
  - Enforces strictly monotonic forward rank progression (`RANK[next] > RANK[current]`). Out-of-order or duplicate updates return false.
- `shipmentStateFor(status)`: Maps courier status to store high-level state (`BOOKED`, `DELIVERED`, `FAILED`).
- User-friendly labels and failure messaging (`STATUS_LABELS`, `FAILURE_TEXT`).

### 3.4. Error Classification & Client Abstraction
- **Error Taxonomy (`src/lib/swiftdrop/errors.ts`):**
  - `kindForStatus(status)` classifies HTTP responses into:
    - `AUTH`: 401, 403 (invalid/revoked API key or merchant suspended; needs admin action).
    - `RETRYABLE`: 5xx, 408, 429, network timeouts (transient; retry with backoff).
    - `REJECTED`: 400, 404, 409, 422 (validation/business constraint violation; needs human fix).
  - Custom `SwiftDropError` carrying classification and HTTP status.
- **Client Facade (`src/lib/swiftdrop/client.ts`):**
  - Declares `SwiftDropClient` contract (`createOrder`, `getTracking`).
  - Factory function `swiftDrop()` conditionally routes to `LiveSwiftDropClient` or `mockClient` based on `SWIFTDROP_MODE`.
- **Live Client (`src/lib/swiftdrop/live.ts`):**
  - Dispatches to `/api/v1/merchant-api/orders` with `X-API-Key` and timeout signal.
  - Fetches `/api/v1/tracked-parcels/{trackingNumber}` for public tracking polling.
  - Parses RFC 9457 Problem Details error responses.
- **Mock Client (`src/lib/swiftdrop/mock.ts`):**
  - In-memory fake ERP supporting rapid zero-dependency development.
  - SHA-256 digest-based deterministic tracking number generation (`SD` + 10 Crockford Base32 characters).
  - Tracking replay detection (`newlyCreated: false` on repeated reference).
  - Fault injection toggle via `SWIFTDROP_MOCK_FAIL=true` (simulates 503 RETRYABLE).

### 3.5. HMAC-SHA256 Signature Engine (`src/lib/swiftdrop/signature.ts`)
- Implemented `signV1(secret, timestamp, rawBody)` producing `"v1=" + HMAC-SHA256(secret, timestamp + "." + rawBody)`.
- Implemented `verifyV1(...)`:
  - Enforces Unix seconds timestamp.
  - Enforces 300-second (5-minute) tolerance window to prevent replay attacks.
  - Uses `crypto.timingSafeEqual` across comma-separated signature candidates for forward compatibility.

---

## 4. Verification & Unit Tests

A comprehensive Vitest test suite was developed across 10 test specifications:
1. `test/env.test.ts`: Environment validation.
2. `test/signature.test.ts`: HMAC signature calculation, validation, replay protection, and error rejection.
3. `test/status.test.ts`: Full permutation matrix of lifecycle state transitions and terminal states.
4. `test/parcel.test.ts`: Shoe sizing tiers, weight limits, and boundary error conditions.
5. `test/phone.test.ts`: Sri Lankan phone format permutations and invalid inputs.
6. `test/reference.test.ts`: Deterministic reference generation across initial and re-ship attempts.
7. `test/errors.test.ts`: Classification of HTTP statuses and `SwiftDropError` construction.
8. `test/mock.test.ts`: Deterministic parcel generation, replay idempotency, and fault injection.
9. `test/types.test.ts`: Zod schema validation against Section A5 ERP response fixtures.
10. `test/validation.test.ts`: Checkout and registration validation schemas.

### Verification Results Summary

| Verification Check | Command | Result |
|---|---|---|
| **Unit Test Suite** | `npm test` | **10 passed (60/60 tests passing)** |
| **ESLint** | `npm run lint` | **0 errors, 0 warnings** |
| **Next.js Production Build** | `npm run build` | **Compiled successfully (Prisma client generated, 5 static routes generated)** |

---

## 5. Next Steps: Phase 3 Preview

With the domain layer and abstraction clients established and verified, the project progresses to **Phase 3: Core Transaction Pipeline & Order Booking**:
1. `src/lib/swiftdrop/apply-status.ts`: Atomic transaction hub with `SELECT ... FOR UPDATE` row locks and timeline creation.
2. `src/lib/swiftdrop/booking.ts`: Concurrency-safe shipment booking service with 60s lease locks and exponential retry backoff.
3. Porting session, user authentication, and shopping cart logic.
4. `src/app/actions/checkout.ts`: Atomic stock reservation + Order creation + Shipment creation (`PENDING_BOOKING`) + post-response asynchronous booking dispatch (`after()`).
5. `CheckoutForm.tsx`: Updated checkout UI with dynamic shipping rates and Sri Lankan address fields.
