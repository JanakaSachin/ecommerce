# Developer Log: Phase 5 — Customer Tracking & Admin Dashboard

**Project:** StrideLK E-Commerce Store  
**Phase:** Phase 5 (Customer Tracking & Admin Dashboard)  
**Date:** 2026-11-14  
**Status:** Completed & Verified ✅  

---

## 1. Overview & Objectives

Phase 5 delivers the customer-facing tracking experience and merchant operations console specified in `docs/merchant-integration-plan.md` and `docs/phase-development-plan.md`.

Key achievements in Phase 5:
1. **Real-Time Customer Tracking:** Real-time forward delivery timeline without PII leakage, automatic 10-second polling refresh widget with visual gap-filling for skipped states, and direct public order tracking.
2. **Storefront & Catalog Completion:** Fully functional catalog pages (`/`, `/products`, `/products/[slug]`, `/category/[slug]`, `/cart`, `/checkout`, `/login`, `/register`, `/track`, `/account/orders`, `/orders/[orderNumber]`).
3. **Comprehensive Admin Console:**
   - **Dashboard (`/admin`):** System health KPIs, red alert banner for SwiftDrop `AUTH` errors, and one-click bulk retry trigger for due bookings.
   - **Shipments Explorer (`/admin/shipments`):** Filterable shipment table with manual retry, on-demand ERP polling, mock simulation controls, and re-shipping triggers.
   - **Webhook Audit Log (`/admin/webhooks`):** Historical record of all inbound webhook deliveries with payload inspector.
   - **Delivery Zones & Rates (`/admin/zones`):** Provincial zones overview, district mappings, customer delivery rate tiering, and one-click ERP zone sync.
4. **Failure Re-shipping Workflow:** Implementation of ADR 0006 re-shipping for `FAILED` orders, creating new shipment records with incremented attempt numbers (`SLK-10045-2`) without mutating terminal failed records.

---

## 2. Directory Structure Established in Phase 5

```
ecommerce/
├── src/
│   ├── app/
│   │   ├── page.tsx                           # Storefront homepage (hero banner, categories, featured)
│   │   ├── layout.tsx                         # Global layout with Header and Footer
│   │   ├── globals.css                        # Tailwind v4 theme colors (brand, accent)
│   │   ├── products/
│   │   │   ├── page.tsx                       # Filterable product catalog
│   │   │   └── [slug]/page.tsx                # Product detail page with SizePicker
│   │   ├── category/
│   │   │   └── [slug]/page.tsx                # Category product catalog
│   │   ├── cart/page.tsx                      # Cart overview and quantity management
│   │   ├── checkout/page.tsx                  # Checkout page
│   │   ├── login/page.tsx                     # Login page
│   │   ├── register/page.tsx                  # Register page
│   │   ├── track/page.tsx                     # Public order tracking page
│   │   ├── account/
│   │   │   └── orders/page.tsx                # Customer order history
│   │   ├── orders/
│   │   │   └── [orderNumber]/page.tsx         # Customer order status & admin action toolbar
│   │   ├── admin/
│   │   │   ├── layout.tsx                     # Admin shell with role check and AdminTabs
│   │   │   ├── page.tsx                       # Dashboard KPIs, AUTH alert & attention list
│   │   │   ├── shipments/page.tsx             # Shipment explorer & operations
│   │   │   ├── webhooks/page.tsx              # Inbound webhook audit log
│   │   │   └── zones/page.tsx                 # Delivery zones & rates manager
│   │   ├── actions/
│   │   │   ├── admin.ts                       # Admin operations (retry, reship, poll, simulate)
│   │   │   └── track.ts                       # Customer tracking lookup action
│   │   └── api/
│   │       └── orders/
│   │           └── [orderNumber]/status/
│   │               └── route.ts               # Sanitized order tracking JSON API
│   ├── components/
│   │   ├── Header.tsx                         # Store header with category nav & session state
│   │   ├── Footer.tsx                         # Store footer with customer promises
│   │   ├── ProductCard.tsx                    # Reusable product card component
│   │   ├── ProductListing.tsx                 # Filterable product grid with faceted search
│   │   ├── SizePicker.tsx                     # Interactive variant size selector
│   │   ├── LoginForm.tsx                      # Login form component
│   │   ├── RegisterForm.tsx                   # Registration form component
│   │   ├── TrackForm.tsx                      # Order search form component
│   │   ├── StatusBadge.tsx                    # Colored state & status pill badge
│   │   ├── DeliveryTimeline.tsx               # Forward monotonic delivery timeline component
│   │   ├── LiveOrderStatus.tsx                # 10s auto-polling live status widget
│   │   └── admin/
│   │       ├── AdminTabs.tsx                  # Admin navigation tabs
│   │       ├── Notice.tsx                     # Flash message alert component
│   │       └── Pager.tsx                      # Pagination component
│   └── lib/
│       └── tracking.ts                        # DTO transformation, gap-filling, status badges
├── scripts/
│   └── sync-zones.ts                          # Standalone CLI zone sync script
└── docs/
    ├── developer-1.md                         # Phase 1 log
    ├── developer-2.md                         # Phase 2 log
    ├── developer-3.md                         # Phase 3 log
    ├── developer-4.md                         # Phase 4 log
    ├── developer-5.md                         # Phase 5 log (this file)
    └── phase-development-plan.md              # Master roadmap
```

---

## 3. Implementation Details

### 3.1. Customer Tracking API & Privacy Sanitization (`src/lib/tracking.ts`, `src/app/api/orders/[orderNumber]/status/route.ts`)
- **Privacy Boundary:** The customer tracking API strictly excludes recipient address, phone number, and internal booking errors. Only the tracking number, delivery status, and chronological event sequence are exposed.
- **Access Control:** Order access is validated via `canViewOrder(order)` matching user session id or the signed `sl_order_access` cookie.
- **Visual Gap-Filling (`buildTimeline`):** If SwiftDrop delivers a parcel and skips reporting intermediate events (e.g. `CREATED` -> `OUT_FOR_DELIVERY`), `buildTimeline` marks prior lifecycle steps as completed so customers see an intuitive continuous progress bar.

### 3.2. Customer Live Order Status Widget (`src/components/LiveOrderStatus.tsx`)
- Configured with a 10-second polling interval (`POLL_MS = 10000`).
- Stops polling automatically once the order enters terminal state (`DELIVERED` or `FAILED`).
- Renders `DeliveryTimeline` and human-friendly status badge.

### 3.3. Admin Integration Console
- **AUTH Error Alert Banner (`/admin`):** Detects if any shipment has failed with an authentication error (`lastBookingError` contains "AUTH" or "401"). Displays an urgent banner directing the merchant to verify the `SWIFTDROP_API_KEY` credential.
- **Bulk Operations:** Form action to retry all due bookings with exponential backoff (`retryAllPendingBookings`).
- **Shipments Table (`/admin/shipments`):**
  - Searchable by order number, tracking number, merchant reference, customer name, and email.
  - Filterable by `ShipmentState` (`PENDING_BOOKING`, `BOOKED`, `NEEDS_ATTENTION`, `DELIVERED`, `FAILED`).
  - Action buttons:
    - **Retry Booking:** Manually triggers `bookShipment`.
    - **Poll Now:** Queries SwiftDrop public tracking endpoint and applies status updates chronologically.
    - **Simulate Next / Simulate Failure:** Sends mock signed webhooks to verify store reaction in development mode.
    - **Re-ship:** Dispatches a re-shipment for failed orders.
- **Webhook Audit Log (`/admin/webhooks`):** Displays all inbound webhook requests, signature validity, deduplication key (`eventId`), and full payload JSON viewer.
- **Delivery Zones & Rates (`/admin/zones`):** Displays provincial zones, active status, customer delivery fees per size (`SMALL`, `MEDIUM`, `LARGE`), and district mappings.

### 3.4. Failure Re-shipping Workflow (`src/app/actions/admin.ts`, ADR 0006)
- When a delivery fails (`state === "FAILED"`):
  1. The failed shipment remains immutable with its failure reason (`RECIPIENT_UNAVAILABLE`, `REFUSED`, etc.).
  2. Admin clicks "Re-ship".
  3. A new `Shipment` record is created with `attempt = last.attempt + 1` and `merchantRef = "SLK-<orderNumber>-<attempt>"`.
  4. The background booking service (`bookShipment`) is triggered asynchronously via Next.js `after()`.

### 3.5. Zone Synchronization (`scripts/sync-zones.ts`, `syncZonesAction`)
- Connects to SwiftDrop ERP (`http://localhost:8080/api/v1/auth/tokens`), fetches active zones (`/api/v1/zones`), upserts local `DeliveryZone` records, and updates district associations.

---

## 4. Verification & Testing

### 4.1. Unit Test Suite
```bash
npm test
```
**Result:** 12 passed test files (63/63 tests passing).

### 4.2. Code Quality & Linting
```bash
npm run lint
```
**Result:** 0 errors, 0 warnings.

### 4.3. Production Next.js Build
```bash
npm run build
```
**Result:** Successfully built all 16 static/dynamic application routes:
- `/`
- `/account/orders`
- `/admin`
- `/admin/shipments`
- `/admin/webhooks`
- `/admin/zones`
- `/api/cron/swiftdrop`
- `/api/orders/[orderNumber]/status`
- `/api/webhooks/swiftdrop`
- `/cart`
- `/category/[slug]`
- `/checkout`
- `/login`
- `/orders/[orderNumber]`
- `/products`
- `/products/[slug]`
- `/register`
- `/track`
- Middleware (`src/middleware.ts`)
