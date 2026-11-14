# Developer Log: Phase 1 — Environment, Database & Project Foundation

**Project:** StrideLK E-Commerce Store  
**Phase:** Phase 1 (Environment, DB & Project Setup)  
**Date:** 2026-11-14  
**Status:** Completed & Verified ✅  

---

## 1. Overview & Objective

Phase 1 established the foundational architecture for the StrideLK e-commerce platform according to the specifications in `docs/merchant-integration-plan.md`. The goal of this phase was to set up a production-grade Next.js 15 project, configure a dedicated PostgreSQL container, implement runtime environment validation, construct the complete Prisma relational database schema, apply initial migrations, and seed baseline data for local development in `mock` mode.

---

## 2. Directory Structure Established

```
ecommerce/
├── compose.yaml                      # Dedicated PostgreSQL 17 container
├── .env.example                      # Committed template of environment variables
├── .env                              # Local environment variables (git-ignored)
├── package.json                      # Next 15, Prisma 6, Vitest, Zod, and custom scripts
├── tsconfig.json                     # TypeScript config with "@/ *" alias
├── vitest.config.mts                 # Vitest configuration with server-only stubbing
├── prisma/
│   ├── schema.prisma                 # Core store & SwiftDrop integration schema
│   ├── migrations/
│   │   └── 20261114095202_init/      # Initial database migration
│   │       └── migration.sql
│   └── seed.ts                       # Database seeder (Admin, catalog, 9 zones, rates)
├── src/
│   ├── app/                          # Next.js App Router root
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   └── globals.css
│   └── lib/
│       ├── db.ts                     # Prisma client singleton instance
│       ├── env.ts                    # Strict runtime Zod validation for env vars
│       └── districts.ts              # Sri Lankan districts & province code mapping
└── test/
    ├── empty.ts                      # Empty stub module for "server-only" in tests
    └── env.test.ts                   # Unit test verifying environment parsing
```

---

## 3. Detailed Work Completed

### 3.1. Next.js 15 Project Scaffolding
- Initialized Next.js 15.5.29 with App Router, TypeScript, Tailwind CSS, ESLint, and path alias `@/*`.
- Configured dependencies:
  - **Runtime:** `@prisma/client@6.19.3`, `zod@^4.6.7`, `bcryptjs@^3.0.3`, `jose@^6.2.17`, `server-only@^0.0.1`.
  - **Development:** `prisma@6.19.3`, `tsx@^4.23.15`, `vitest@^5.1.0`, `@types/bcryptjs@^2.4.6`, `@types/node@^22.20.5`.
- Updated `package.json` scripts:
  - `"dev"`: `next dev --turbopack -p 3100` (port 3100 ensures no collision with ERP frontend on 3000)
  - `"build"`: `prisma generate && next build`
  - `"test"`: `vitest run`
  - `"db:migrate"`: `prisma migrate dev`
  - `"db:seed"`: `prisma db seed`
  - `"cron:local"`: `tsx --env-file=.env scripts/cron-local.ts`
  - `"webhook:send"`: `tsx --env-file=.env scripts/send-webhook.ts`
  - `"zones:sync"`: `tsx --env-file=.env scripts/sync-zones.ts`

### 3.2. Dedicated Store Database (`compose.yaml`)
- Configured PostgreSQL 17 Alpine for the store database.
- **Port Allocation:** Bound to `127.0.0.1:5434:5432`.
  > **Note:** Port `5433` was already bound on the host machine by `swiftdrop-postgres-1` (SwiftDrop ERP DB). Port `5434` was selected to prevent port collisions.
- Database: `store`, User: `store`, Password: `store-local-only`.
- Container `ecommerce-store-db-1` is up, healthy, and persisting data to volume `store-db-data`.

### 3.3. Environment Validation (`src/lib/env.ts`)
- Created `.env.example` and `.env`. Updated `.gitignore` to ensure `.env` and secret files are never committed, while preserving `.env.example`.
- Created `src/lib/env.ts` with strict Zod parsing:
  - Validates `SWIFTDROP_MODE` (`"mock" | "live"`).
  - Validates `SWIFTDROP_API_URL` as a valid URL.
  - Enforces `sd_live_` prefix for `SWIFTDROP_API_KEY` when in `live` mode.
  - Enforces 16+ character secrets for `SWIFTDROP_WEBHOOK_SECRET` and `CRON_SECRET`.
  - Validates pickup warehouse details and UUID format for `STORE_PICKUP_ZONE_ID`.
  - Uses `import "server-only"` to prevent client-side bundle leakage.

### 3.4. Relational Database Schema (`prisma/schema.prisma`)
Constructed the complete relational data model:
- **Enums:**
  - `Role`: `CUSTOMER`, `ADMIN`
  - `ParcelSize`: `SMALL`, `MEDIUM`, `LARGE`
  - `DeliveryStatus`: `CREATED`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED` (no `ASSIGNED` status per ADR 0006)
  - `FailureReason`: `RECIPIENT_UNAVAILABLE`, `ADDRESS_NOT_FOUND`, `REFUSED`, `DAMAGED`, `OTHER`
  - `ShipmentState`: `PENDING_BOOKING`, `BOOKED`, `NEEDS_ATTENTION`, `DELIVERED`, `FAILED`
  - `EventSource`: `BOOKING`, `WEBHOOK`, `POLL`
- **Store Core Models:**
  - `User`: Accounts with hashed passwords and role-based access.
  - `Category`, `Product`, `ProductVariant`: Product catalog with pricing, SKUs, and stock tracking.
  - `Cart`, `CartItem`: Persistent shopping carts.
  - `Order`, `OrderItem`: Customer orders, addresses, items, and cost breakdowns.
- **Integration Models:**
  - `Shipment`: Courier parcel record with `merchantRef` (unique, e.g. `SLK-10045`), courier tracking details, concurrency lease (`bookingLeaseUntil`), retry schedule (`nextBookingAt`), and failure tracking.
  - `DeliveryEvent`: Append-only delivery history with unique constraint on `[shipmentId, status]`.
  - `DeliveryZone`: SwiftDrop zone representation.
  - `DistrictZone`: Sri Lankan district to SwiftDrop zone mapping.
  - `DeliveryRate`: Tiered customer shipping fees by zone and parcel size.
  - `WebhookLog`: Audit log with unique `eventId` for deduplication.

### 3.5. Database Migration
- Executed `npx prisma migrate dev --name init`.
- Successfully generated migration `20261114095202_init` and created all tables, unique indexes, and foreign keys in PostgreSQL.
- Generated Prisma Client v6.19.3.

### 3.6. Database Seeder (`prisma/seed.ts`)
- Implemented `prisma/seed.ts` and executed `npx prisma db seed`:
  1. **Admin Account:** Created `admin@stridelk.local` with bcrypt hashed password.
  2. **Product Catalog:** Seeded footwear category with running shoes, leather oxfords, and sneakers across multiple sizes/variants.
  3. **SwiftDrop Zones (Mock Mode):** Inserted 9 province zones (`WP`, `CP`, `SP`, `NP`, `EP`, `NWP`, `NCP`, `UVA`, `SAB`) with deterministic UUIDs (`00000000-0000-4000-8000-000000000001` through `09`).
  4. **District Mappings:** Mapped all 25 Sri Lankan districts to province zones using `src/lib/districts.ts`.
  5. **Delivery Rates:** Seeded tiered shipping rates:
     - Western Province (`WP`): SMALL: LKR 350, MEDIUM: LKR 400, LARGE: LKR 550.
     - Out-of-province: SMALL: LKR 450, MEDIUM: LKR 500, LARGE: LKR 700.

### 3.7. Vitest Testing Infrastructure
- Configured `vitest.config.mts` with `import.meta.dirname` and `server-only` stubbing.
- Added `test/env.test.ts` verifying configuration validation.
- All tests execute and pass cleanly.

---

## 4. Port and Service Allocation Matrix

| Service | Port | Status | Purpose |
|---|---|---|---|
| **Store Web (Next.js)** | `3100` | Configured | Next.js development server (`-p 3100`) |
| **Store Database (PostgreSQL)** | `5434` | Running (`ecommerce-store-db-1`) | Dedicated database for the store |
| **SwiftDrop ERP Database** | `5433` | Host process (`swiftdrop-postgres-1`) | ERP PostgreSQL database |
| **SwiftDrop RabbitMQ** | `5672` / `15672` | Host process (`swiftdrop-rabbitmq-1`) | ERP message broker |
| **SwiftDrop ERP Backend** | `8080` | External | Spring Boot merchant/delivery API |
| **SwiftDrop ERP Portal** | `3000` | External | Merchant/Courier web portal |

---

## 5. Verification & Test Results

| Check | Command | Result |
|---|---|---|
| Unit Tests | `npm test` | **1 passed** (0 warnings) |
| Linter | `npm run lint` | **0 errors / 0 warnings** |
| Production Build | `npm run build` | **Compiled successfully** (Prisma client generated, 5 static routes generated) |
| Database Seed | `npx prisma db seed` | **Success** (Admin, catalog, 9 zones, 25 districts, rates populated) |

---

## 6. Next Steps: Phase 2 Preview

With Phase 1 complete, the project is ready for **Phase 2: Domain Utilities & SwiftDrop Abstraction Layer**:
1. `src/lib/swiftdrop/types.ts`: TypeScript types and Zod schemas for the ERP contract.
2. `src/lib/swiftdrop/reference.ts`: Deterministic reference generation (`SLK-10045`).
3. `src/lib/swiftdrop/parcel.ts`: Parcel weight and sizing calculations.
4. `src/lib/phone.ts`: Sri Lankan phone number sanitization (`+94XXXXXXXXX`).
5. `src/lib/swiftdrop/status.ts`: Forward-only lifecycle state machine and rank rules.
6. `src/lib/swiftdrop/errors.ts` & `client.ts`: Error classification and client interface.
7. `src/lib/swiftdrop/mock.ts` & `live.ts`: Mock and Live HTTP client implementations.
8. Vitest unit test suite covering pure functions.
