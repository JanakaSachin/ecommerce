# Developer Log: Phase 3 — Core Transaction Pipeline & Order Booking

**Project:** StrideLK E-Commerce Store  
**Phase:** Phase 3 (Core Transaction Pipeline & Booking)  
**Date:** 2026-11-14  
**Status:** Completed & Verified ✅  

---

## 1. Overview & Objectives

Phase 3 implements the transactional core of the e-commerce store and the shipment booking pipeline according to `docs/merchant-integration-plan.md`. This phase establishes:
1. The **Single Status Mutation Hub** (`applyStatus`) with PostgreSQL row-level locking.
2. The **Shipment Booking Service** (`bookShipment`, `retryDueBookings`) with lease-based concurrency locks and exponential backoff retry scheduling.
3. Core store capabilities: session management, authentication, persistent shopping cart, catalog filtering, and order access control.
4. The atomic checkout transaction (`placeOrder`) that reserves inventory, persists the order snapshot, creates the initial shipment in `PENDING_BOOKING`, and dispatches background booking asynchronously via Next.js `after()`.
5. Frontend checkout form (`CheckoutForm.tsx`) with dynamic delivery fee quotes and Sri Lankan address fields.

---

## 2. Directory Structure Established in Phase 3

```
ecommerce/
├── src/
│   ├── middleware.ts                     # Route protection for /admin and /account
│   ├── components/
│   │   ├── FormField.tsx                 # Standardized form input field with error messaging
│   │   └── CheckoutForm.tsx              # Dynamic checkout form with district fee quoting
│   ├── app/
│   │   └── actions/
│   │       ├── auth.ts                   # User registration, login, and logout actions
│   │       ├── cart.ts                   # Add to cart, update quantity, and remove item
│   │       └── checkout.ts               # placeOrder & getDeliveryQuote server actions
│   └── lib/
│       ├── money.ts                      # LKR currency formatter
│       ├── dates.ts                      # Sri Lanka timezone (UTC+5:30) date formatters
│       ├── cookie-options.ts             # Secure cookie options for local/production
│       ├── jwt.ts                        # Jose JWT session signing & verification
│       ├── session.ts                    # User & admin session management helpers
│       ├── cart.ts                       # Guest & user cart lifecycle management
│       ├── catalog.ts                    # Catalog search & filtering utilities
│       ├── order-access.ts               # Guest cookie-based order view permissions
│       └── swiftdrop/
│           ├── apply-status.ts           # Transactional state mutation engine (FOR UPDATE lock)
│           └── booking.ts                # Idempotent booking service with lease claiming
├── test/
│   └── booking.test.ts                   # Create order request payload builder tests
└── docs/
    ├── developer-1.md                    # Phase 1 documentation
    ├── developer-2.md                    # Phase 2 documentation
    ├── developer-3.md                    # Phase 3 documentation (this file)
    ├── phase-development-plan.md         # Updated phase development roadmap
    └── merchant-integration-plan.md      # Master blueprint
```

---

## 3. Detailed Components Implemented

### 3.1. Transactional State Mutation Engine (`src/lib/swiftdrop/apply-status.ts`)
- Implements `applyStatus(tx, shipmentId, news)` inside a database transaction:
  1. **Row Lock:** Executes `SELECT id FROM "Shipment" WHERE id = $1 FOR UPDATE` to serialize concurrent updates from webhooks and the poller.
  2. **Append-Only Timeline:** Inserts a `DeliveryEvent` audit record with `skipDuplicates: true` on `[shipmentId, status]`.
  3. **Monotonic Forward Progression:** Evaluates `shouldMoveTo(current, next)`. If valid, updates `shipment.deliveryStatus`, `shipment.state`, and `failureReason`.
  4. **Failure Reason Backfill:** If polling previously marked a shipment `FAILED` without a reason code and a webhook later delivers `failureReasonCode`, updates the shipment and timeline retroactively.

### 3.2. Shipment Booking Service (`src/lib/swiftdrop/booking.ts`)
- **Lease-Based Concurrency Lock:**
  - Updates shipment with a 60-second lease (`bookingLeaseUntil = now + 60s`) via atomic `updateMany`. Prevents checkout actions and background cron jobs from double-booking.
- **Idempotent Dispatch:**
  - Formats wire payload using `buildCreateRequest()`.
  - Dispatches to `swiftDrop().createOrder()`.
  - On `201` / `200` success: Records `parcelId`, `trackingNumber`, and `courierFee`, clears errors, and applies initial `CREATED` status.
- **Resilient Fault Handling:**
  - Classifies errors into `AUTH`, `RETRYABLE`, or `REJECTED`.
  - If retryable and attempts < 10: Schedules `nextBookingAt` with exponential backoff (1–60 mins + random jitter).
  - If unrecoverable (`AUTH`, `REJECTED`) or attempts >= 10: Flags shipment as `NEEDS_ATTENTION` for admin intervention.
- **Background Cron Hook (`retryDueBookings`):**
  - Queries due `PENDING_BOOKING` shipments and processes bookings in batch.

### 3.3. Store Core Modules Ported
- **Authentication & Sessions (`src/lib/jwt.ts`, `src/lib/session.ts`):**
  - Signed HS256 JWT sessions stored in HTTP-only `sl_session` cookies.
  - Role-based authorization (`requireUser`, `requireAdmin`).
- **Shopping Cart Lifecycle (`src/lib/cart.ts`):**
  - Supports persistent guest carts stored in `sl_cart` cookies.
  - Merges guest cart into user account upon authentication via `mergeGuestCart()`.
- **Order Access Control (`src/lib/order-access.ts`):**
  - Allows guest customers to track their placed orders via signed `sl_order_access` cookie without requiring account registration.

### 3.4. Checkout Server Action (`src/app/actions/checkout.ts`)
- `placeOrder`:
  1. Validates checkout input against `checkoutSchema`.
  2. Enforces order volume ceiling: `itemCount <= 20` pairs.
  3. Resolves province zone via `zoneForDistrict()` and customer delivery fee via `customerDeliveryFee()`.
  4. Executes single atomic DB transaction:
     - Decrements inventory with atomic guard (`stock >= quantity`).
     - Inserts `Order` snapshot with customer details and line items.
     - Inserts `Shipment` in `PENDING_BOOKING` state with deterministic reference `SLK-<orderNumber>`.
     - Clears the active shopping cart.
  5. Schedules non-blocking background dispatch via Next.js `after(() => bookShipment(shipmentId))`.
  6. Grants order access token and redirects to `/orders/[orderNumber]`.
- `getDeliveryQuote`:
  - Dynamically computes accurate shipping fees and parcel sizes on the server when the customer changes their district.

### 3.5. Checkout Form UI (`src/components/CheckoutForm.tsx`)
- Integrated dynamic fee quoting based on district selection.
- Removed deprecated Express delivery tier per ADR 0006.
- Added optional Postal Code field.
- Displays clear Cash-on-Delivery payment terms and price breakdown.

---

## 4. Verification & Quality Results

| Verification Check | Command | Result |
|---|---|---|
| **Unit Test Suite** | `npm test` | **11 passed (61/61 tests passing)** |
| **ESLint** | `npm run lint` | **0 errors, 0 warnings** |
| **Next.js Production Build** | `npm run build` | **Compiled successfully (Prisma client v6.19.3 generated, all static pages and middleware built)** |

---

## 5. Next Steps: Phase 4 Preview

With the core transaction pipeline and booking engine operational, the project progresses to **Phase 4: Status Updates — Webhooks & Polling**:
1. `src/lib/swiftdrop/signature.ts`: Integrated HMAC-SHA256 signature engine (already implemented and unit-tested).
2. `src/lib/swiftdrop/webhook.ts`: Webhook event deduplication and transactional ingestion.
3. `src/app/api/webhooks/swiftdrop/route.ts`: Node.js raw-body webhook endpoint.
4. `src/lib/swiftdrop/poller.ts`: Background poller fetching public tracking data.
5. `src/app/api/cron/swiftdrop/route.ts` & `scripts/cron-local.ts`: Authenticated background cron scheduler.
6. `scripts/send-webhook.ts`: Webhook simulator for local development.
