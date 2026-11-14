# SwiftDrop Merchant Integration: Complete Implementation Guide

**For:** developers building the e-commerce store, including developers new to SwiftDrop.
**Status:** Ready to implement · 2026-11-14
**ERP version checked:** `D:\EADproject\SwiftDrop`, branch `feature/merchant` (backend source read
directly). Where the ERP design docs and the ERP code disagree, this guide follows **the code**.

> **How to use this guide.** Read Part A completely before writing code. Then do Part B (setup)
> once. Then do Part C one step at a time. Each step ends with a **Check**. Don't start the next
> step until the check passes. Part D is how you test, and Part E is for when something breaks.

---

## Contents

- **Part A: Understand**
  - A1. What we are building
  - A2. Words you need to know
  - A3. What the ERP can and cannot do today
  - A4. Architecture
  - A5. ERP API reference (exact contract)
- **Part B: Set up (once)**
  - B1. Tools and ports
  - B2. Run the ERP locally
  - B3. Seed zones and pricing in the ERP
  - B4. Create the store's merchant account, API key and webhook
  - B5. Create the store project
- **Part C: Build (step by step)**
  - Step 1: Port the store core from the example
  - Step 2: Database schema
  - Step 3: Environment config
  - Step 4: ERP types and schemas
  - Step 5: Errors and the live client
  - Step 6: Mock client
  - Step 7: Helpers (reference, parcel size, phone, districts, zones)
  - Step 8: Status rules
  - Step 9: `applyStatus` (the most important function)
  - Step 10: Booking
  - Step 11: Checkout wiring
  - Step 12: Webhook receiver
  - Step 13: Poller and cron
  - Step 14: Webhook simulator script
  - Step 15: Zone sync script
  - Step 16: Customer tracking UI
  - Step 17: Admin integration console
  - Step 18: Re-ship after failure
- **Part D: Test**
  - D1. Unit tests
  - D2. Manual end-to-end test with the real ERP
  - D3. Acceptance checklist
- **Part E: Operate and troubleshoot**
  - E1. What happens for each ERP response
  - E2. Troubleshooting
  - E3. Security rules
  - E4. When the ERP adds missing features
  - E5. Decisions already made (and why)

---

# Part A: Understand

## A1. What we are building

Two separate systems, owned by different teams:

- **SwiftDrop ERP**: the courier company's system (Spring Boot, Java). It owns parcels,
  couriers, zones, prices and delivery status. Its **merchant module** lets outside businesses
  send it parcels.
- **The store (us)**: a Next.js shoe shop. To SwiftDrop, the store is just **one merchant**
  (a business customer).

The life of one order:

```
1. Kumari buys 2 pairs of shoes.                          (store)
2. The store saves order #10045 in ITS OWN database.      (store)
3. The store asks SwiftDrop: "create a parcel for          store ──POST──► ERP
   reference SLK-10045, from our warehouse to Kumari".
4. SwiftDrop answers: "OK, tracking number SD7K3M9Q2XWB".  store ◄─────── ERP
5. A courier picks it up, drives it, delivers it.          (ERP + courier app)
   Each step changes the parcel status in the ERP.
6. The store learns about every status change:
   a) the ERP calls the store (webhook), or                store ◄─POST── ERP
   b) the store asks the ERP every few minutes (polling).  store ──GET───► ERP
7. Kumari opens "My orders" and sees the timeline.         (store)
```

The store never reads the ERP database and never talks to RabbitMQ. It only uses HTTP.

## A2. Words you need to know

| Word | Meaning here |
|---|---|
| **Merchant** | A business that sends parcels through SwiftDrop. Our store is one merchant. |
| **Order** | A store purchase (items, prices, customer). Lives only in the store DB. |
| **Shipment** | The store's record of "we asked SwiftDrop to deliver this order". One order normally has one shipment. A second one appears only after a failed delivery is re-shipped. |
| **Parcel** | SwiftDrop's record of the physical package. One shipment ↔ one parcel. |
| **`merchantOrderReference`** | The ID **we** give the parcel, e.g. `SLK-10045`. SwiftDrop stores it and sends it back in every status update. It must be unique per merchant and must never change for that shipment. |
| **Tracking number** | The ID **SwiftDrop** gives the parcel, e.g. `SD7K3M9Q2XWB` (always `SD` + 10 characters). |
| **Zone** | A delivery area in SwiftDrop, identified by a UUID. Every address we send must have a `zoneId`. We map Sri Lankan districts to zones. |
| **Pricing rule** | SwiftDrop's price for a (from-zone, to-zone) pair. If no rule exists, SwiftDrop can't create the parcel. |
| **API key** | A secret string (`sd_live_…`) that proves a request comes from our store. Sent in the `X-API-Key` header. Like a password for a program. |
| **JWT** | A login token for a **person** (admin, merchant user, courier). We only use it during setup and testing, never in store code paths at runtime (except the zone sync script). |
| **Idempotent** | "Doing it twice has the same effect as doing it once." If we send the same `merchantOrderReference` twice, SwiftDrop returns the **same** parcel instead of making a second one. That makes retries safe. |
| **Webhook** | An HTTP `POST` that the ERP sends **to us** when something happens. We expose a URL, the ERP calls it. |
| **HMAC signature** | Proof that a webhook really came from SwiftDrop. Both sides know a shared secret. The ERP computes `HMAC-SHA256(secret, timestamp + "." + body)` and sends it in a header. We compute the same and compare. A fake sender doesn't know the secret, so it can't produce a matching signature. |
| **Replay attack** | Someone captures a real webhook and sends it again later. We block this by rejecting timestamps older than 5 minutes and ignoring event IDs we've already processed. |
| **Event ID** | A UUID unique to each status change event. Used to detect duplicates. |
| **Sequence** | A per-parcel counter on events (1 = `CREATED`, then 2, 3…). Events can arrive out of order; the higher number is the newer one. |
| **Polling** | Asking the ERP "what's the status now?" on a timer. Slower than webhooks but works even when webhooks don't. |
| **Terminal status** | `DELIVERED` or `FAILED`. Nothing changes after that, ever. |
| **Problem Details** | The ERP's error format (RFC 9457): `{ "status": 400, "title": "Bad Request", "detail": "…" }`. |
| **Server-only** | Code that runs only on the Next.js server, never in the browser. All SwiftDrop code is server-only so the API key can't leak. |

## A3. What the ERP can and cannot do today

Checked in the ERP source on 2026-11-14:

| Capability | Exists? | How | What it means for us |
|---|---|---|---|
| Merchant self-registration | ✅ | `POST /api/v1/merchants/register` | Setup step B4 |
| Admin approves merchant | ✅ | `PATCH /api/v1/admin/merchants/{id}/status` | Setup step B4 |
| API keys | ✅ | `POST /api/v1/merchants/me/api-keys` | Setup step B4 |
| **Create parcel with API key** | ✅ | `POST /api/v1/merchant-api/orders` | Main integration call |
| Register webhook URL | ✅ | `POST /api/v1/merchants/me/webhooks` | Setup step B4 |
| **ERP actually sending webhooks** | ❌ | Tables exist, sender not built (no branch has it) | **Polling is our main source of updates for now.** The webhook receiver is built and tested with our simulator, so it works the day the ERP turns sending on. |
| Public tracking | ✅ | `GET /api/v1/tracked-parcels/{trackingNumber}` (no auth) | Used by our poller |
| Live tracking stream (SSE) | ✅ | `GET /api/v1/tracked-parcels/{tn}/events` | Optional, later |
| List zones | ⚠️ | `GET /api/v1/zones` needs a **person's JWT**, not the API key | Zone sync script logs in as the merchant user (Step 15) |
| Create zones / pricing rules | ❌ | No API; tables only | We insert them with SQL for local dev (B3) |
| Price quote | ⚠️ | `POST /api/v1/price-quotes` needs a JWT | Store charges its own delivery price table (E5) |
| Look up a parcel by our reference with the API key | ❌ | Not built | Re-send the same create request; it returns the existing parcel |
| Courier assignment API (dispatcher) | ❌ | Internal Java API only, no HTTP endpoint | For testing, assign with one SQL `UPDATE` (D2) |
| Courier status updates + proof | ✅ | `POST /api/v1/parcels/{id}/status-changes`, `PUT /api/v1/parcels/{id}/proof` | Used in our end-to-end test (D2) |
| Cancel a parcel / retry after failure | ❌ | Not in v1, by design (ADR 0006) | Re-ship = new parcel with a new reference (Step 18) |

> ⚠️ **Don't trust the ERP design docs for field names.** `implementation-contract.md` says
> `POST /api/v1/merchant-orders` with `X-Api-Key: sdk_…`. The real code uses
> `POST /api/v1/merchant-api/orders` with `X-API-Key: sd_live_…`. Section A5 is from the code.

## A4. Architecture

### Components

```
                         Browser (customer, store admin)
                              │                ▲
                 pages, server actions          │ polls GET /api/orders/{n}/status every 10 s
                              ▼                │
┌──────────────────────────────── Next.js store (port 3100) ─────────────────────────────────┐
│                                                                                             │
│  Storefront · Cart · Checkout · My orders · Track · Admin                                   │
│        │                                                   ▲                                │
│        │ 1. save Order + Shipment (one DB transaction)     │ reads Shipment + DeliveryEvent │
│        ▼                                                   │                                │
│  ┌──────────────────────────── src/lib/swiftdrop/ ────────────────────────────────────┐     │
│  │  booking.ts      bookShipment(): send create request, record result or retry       │     │
│  │  apply-status.ts applyStatus(): THE ONLY code that changes delivery status         │     │
│  │  webhook.ts      handle a verified status event                                    │     │
│  │  poller.ts       ask ERP for status of open shipments                              │     │
│  │  signature.ts    HMAC v1 verify / sign                                             │     │
│  │  client.ts ──► live.ts (real HTTP)  |  mock.ts (fake ERP for development)          │     │
│  │  types.ts, errors.ts, status.ts, reference.ts, parcel.ts, zones.ts                 │     │
│  └────────────────────────────────────────────────────────────────────────────────────┘     │
│      ▲ POST /api/webhooks/swiftdrop          ▲ GET /api/cron/swiftdrop (every minute)       │
└──────┼───────────────────────────────────────┼──────────────────────┬────────────┬──────────┘
       │ signed webhook                        │ local cron script     │ X-API-Key  │ public GET
       │                                                                ▼            ▼
┌──────┴──────────────────────────────── SwiftDrop ERP (port 8080) ──────────────────────────┐
│  merchant module:  POST /api/v1/merchant-api/orders                                         │
│  delivery module:  GET  /api/v1/tracked-parcels/{trackingNumber}                            │
│  (future) webhook sender ──► our /api/webhooks/swiftdrop                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

### Five rules (every PR is reviewed against these)

1. **Save first, call the ERP second.** The order and shipment are committed to our DB before we
   call SwiftDrop. If SwiftDrop is down, the order is safe and gets retried.
2. **Only `src/lib/swiftdrop/` knows SwiftDrop's field names.** Pages and actions use our own
   types. When SwiftDrop changes its API, only that folder changes.
3. **Only `applyStatus()` changes a shipment's delivery status.** Booking, webhooks, polling and
   the simulator all call it. That's how they can never disagree.
4. **Status only moves forward.** Old or repeated news is stored in the timeline but never moves
   a shipment backwards.
5. **Secrets stay on the server.** The API key and webhook secret live in `.env` only. Never in
   the database, logs, browser code or Git.

### Who owns what

| Thing | Owner | Notes |
|---|---|---|
| Products, carts, orders, customer accounts, prices | Store | |
| Delivery price charged to the customer | Store | From our `DeliveryRate` table |
| Parcel, tracking number, courier fee, status | ERP | We keep a copy for display |
| Zones and pricing rules | ERP | We keep a synced copy + our district mapping |
| Merchant account, API key, webhook registration | ERP | Created once by a person (B4) |

## A5. ERP API reference (exact contract)

Base URL in local dev: `http://localhost:8080`

### A5.1 Create parcel

```
POST /api/v1/merchant-api/orders
X-API-Key: sd_live_<48 hex characters>
Content-Type: application/json
```

```json
{
  "merchantOrderReference": "SLK-10045",
  "pickup": {
    "contactName": "StrideLK Warehouse",
    "phone": "+94110000000",
    "line1": "12 Warehouse Rd",
    "line2": null,
    "city": "Colombo 10",
    "zoneId": "8f1c2a4e-1111-4b2c-9d3e-000000000001",
    "postalCode": "01000"
  },
  "dropoff": {
    "contactName": "Kumari Silva",
    "phone": "+94711234567",
    "line1": "4 Lake View",
    "line2": "Off Peradeniya Rd",
    "city": "Kandy",
    "zoneId": "8f1c2a4e-2222-4b2c-9d3e-000000000002",
    "postalCode": "20000"
  },
  "size": "MEDIUM",
  "weightGrams": 2500,
  "description": "Shoes x2 (order #10045)"
}
```

| Field | Rule |
|---|---|
| `merchantOrderReference` | required, ≤ 100 chars, unique for our merchant |
| `pickup`, `dropoff` | required objects |
| `contactName` | required, ≤ 200 |
| `phone` | required, ≤ 20 (we always send `+94XXXXXXXXX`) |
| `line1` | required, ≤ 200 |
| `line2` | optional, ≤ 200 |
| `city` | required, ≤ 100 |
| `zoneId` | required UUID of an **active** ERP zone |
| `postalCode` | optional, ≤ 10 |
| `size` | `SMALL`, `MEDIUM` or `LARGE` |
| `weightGrams` | integer 1–30000 |
| `description` | optional, ≤ 200 |
| *(fee)* | **Don't send one.** SwiftDrop calculates it. |

Success response (flat JSON, **not** wrapped in `data`):

```json
{
  "parcelId": "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
  "trackingNumber": "SD7K3M9Q2XWB",
  "status": "CREATED",
  "feeAmount": 650.00,
  "feeCurrency": "LKR",
  "createdAt": "2026-11-14T10:15:30.123Z",
  "newlyCreated": true
}
```

| HTTP | Meaning | What we do |
|---|---|---|
| `201` | New parcel created | Save tracking number |
| `200` | This reference already exists: here is the **existing** parcel (`newlyCreated: false`) | Same as 201. This is the "safe retry" behaviour. |
| `400` | Validation failed (`detail` says why) | Stop. Mark shipment **needs attention**. |
| `401` | Missing, wrong or revoked API key | Stop. Admin must fix the key. |
| `403` | Merchant not approved / suspended | Stop. Contact SwiftDrop. |
| `409`, `422` | Business rule broken | Stop. Needs attention. |
| `5xx`, `408`, `429`, timeout, network error | Temporary problem | Retry later with backoff |

Error body example:

```json
{ "type": "about:blank", "title": "Bad Request", "status": 400, "detail": "Invalid request" }
```

### A5.2 Public tracking (no auth)

```
GET /api/v1/tracked-parcels/SD7K3M9Q2XWB
```

```json
{
  "trackingNumber": "SD7K3M9Q2XWB",
  "status": "IN_TRANSIT",
  "pickupCity": "Colombo 10",
  "dropoffCity": "Kandy",
  "history": [
    { "status": "CREATED",    "occurredAt": "2026-11-14T10:15:30Z" },
    { "status": "PICKED_UP",  "occurredAt": "2026-11-14T12:01:02Z" },
    { "status": "IN_TRANSIT", "occurredAt": "2026-11-14T13:40:00Z" }
  ]
}
```

`404` = unknown tracking number. There's **no failure reason** in this view; only webhooks carry
it.

### A5.3 Status webhook (ERP → store)

Not sent by the ERP yet (A3). This is the agreed format (ADR 0004 §2, §7.2, and the
`ParcelStatusChanged` Java record):

```
POST http://localhost:3100/api/webhooks/swiftdrop
Content-Type: application/json
X-SwiftDrop-Event-Id: 0f4b2c1a-…
X-SwiftDrop-Event-Type: parcel.status-changed
X-SwiftDrop-Timestamp: 1763121662
X-SwiftDrop-Signature: v1=3b9f…(64 hex chars)
```

```json
{
  "eventId": "0f4b2c1a-9d8e-4f7a-b6c5-d4e3f2a1b0c9",
  "eventType": "parcel.status-changed",
  "schemaVersion": 1,
  "occurredAt": "2026-11-14T12:01:02Z",
  "producer": "delivery",
  "data": {
    "parcelId": "5a0e9c1d-7b2f-4c1e-8a3d-1f2e3d4c5b6a",
    "trackingNumber": "SD7K3M9Q2XWB",
    "previousStatus": "CREATED",
    "newStatus": "PICKED_UP",
    "sequence": 2,
    "source": "MERCHANT",
    "ownerCustomerId": null,
    "ownerMerchantId": "77aa…",
    "merchantOrderReference": "SLK-10045",
    "failureReasonCode": null
  }
}
```

**Signature:** `X-SwiftDrop-Signature` = `"v1=" + hex(HMAC_SHA256(key = webhook secret, message =
timestamp + "." + rawBody))`. The timestamp is Unix **seconds**. Every retry gets a new timestamp
and signature, but the same body and event ID.

**How the ERP treats our reply** (ADR 0004 §7.1):

| We return | ERP does |
|---|---|
| any `2xx` | Done |
| `5xx`, `408`, `429`, timeout, connection error | Retries later with backoff |
| `3xx` or any other `4xx` | **Gives up** on that event (marked failed) |

So: return `2xx` for anything we've handled **or intentionally ignore**. Return `500` only when we
**want** a retry (our DB failed). Return `401` for bad signatures (a forged request shouldn't be
retried).

**Our obligations as receiver:** verify the signature over the raw body before parsing, use a
constant-time compare, reject timestamps more than 5 minutes off, deduplicate by `eventId`, and
never let an older event overwrite a newer status.

### A5.4 Lifecycle (ADR 0006)

```
CREATED ──► PICKED_UP ──► IN_TRANSIT ──► OUT_FOR_DELIVERY ──► DELIVERED
                 │              │                 │
                 └──────────────┴─────────────────┴──────────► FAILED
```

- Status moves **one step forward** at a time. Nothing is skipped and nothing goes back.
- `DELIVERED` and `FAILED` are final. No retry, cancel or reopen.
- There's **no `ASSIGNED` status** (the example store had one; remove it).
- `FAILED` always has a `failureReasonCode`: `RECIPIENT_UNAVAILABLE`, `ADDRESS_NOT_FOUND`,
  `REFUSED`, `DAMAGED`, `OTHER`.
- Courier notes and proof-of-delivery data never leave the ERP.

### A5.5 Differences from the example store (`exampleecommerce/stridelk-store-main`)

The example was written against a guessed API. When you copy code from it, change these:

| Example | Real ERP |
|---|---|
| `POST /api/v1/integrations/orders` | `POST /api/v1/merchant-api/orders` |
| `Idempotency-Key` header | No header. The `merchantOrderReference` is the idempotency key. |
| `externalOrderRef` | `merchantOrderReference` |
| `district`, `contactPhone` | `zoneId` (UUID), `phone`, plus `line2`, `postalCode` |
| `parcel: { weightKg, size, deliveryType, description }` | Top level `size`, `weightGrams` (integer), `description`. **No delivery type.** |
| Response `{ data: { …, trackingUrl, quotedFee } }` | Flat `{ parcelId, trackingNumber, status, feeAmount, feeCurrency, createdAt, newlyCreated }` |
| Error `error.message` | Problem Details `detail` |
| Quote `POST /api/v1/pricing/quote` | `POST /api/v1/price-quotes` (JWT only; not used by us) |
| Webhook `type: "parcel.status_changed"` (underscore) | `eventType: "parcel.status-changed"` (hyphen) |
| `data.status`, `note`, free-text `failureReason` | `data.newStatus`, `sequence`, `failureReasonCode` (enum). No note. |
| Signature `sha256=<hex>`, timestamp in ms or s | `v1=<hex>`, timestamp in seconds |
| Status `ASSIGNED`; re-attempt after `FAILED` | No `ASSIGNED`; `FAILED` is final |
| `X-SwiftDrop-Delivery-Id` header | `X-SwiftDrop-Event-Id` |
| `src/lib/districts.ts` imported but missing from the repo | We write it (Step 7) |

---

# Part B: Set up (once)

## B1. Tools and ports

Install what the ERP needs (see the ERP's `docs/development-setup.md`): **JDK 21**, **Node.js
24 LTS**, **Docker Desktop**, Git. Check in a new terminal:

```powershell
java -version; node -v; npm -v; docker compose version; git --version
```

| Service | Port | Why this port |
|---|---|---|
| ERP backend | `8080` | ERP default |
| ERP frontend (merchant/courier portal) | `3000` | ERP default; its CORS default is `http://localhost:3000` |
| ERP PostgreSQL | `5432` | ERP `compose.yaml` |
| ERP RabbitMQ | `5672`, UI `15672` | ERP `compose.yaml` |
| **Store (Next.js)** | **`3100`** | Must not clash with the ERP frontend |
| **Store PostgreSQL** | **`5433`** | Separate database, separate container |

## B2. Run the ERP locally

```powershell
cd D:\EADproject\SwiftDrop
git checkout feature/merchant          # the branch with the merchant API (ask the ERP team if it moved)
Copy-Item .env.example .env            # only the first time
```

Edit the ERP's `.env`:

```dotenv
SWIFTDROP_POSTGRES_PASSWORD=<your local password>
SWIFTDROP_RABBITMQ_PASSWORD=<your local password>
SWIFTDROP_JWT_SECRET=<48 random bytes, base64; command is in the file>
SWIFTDROP_BOOTSTRAP_ADMIN_EMAIL=admin@swiftdrop.local
SWIFTDROP_BOOTSTRAP_ADMIN_PASSWORD=Admin12345!
```

Start it:

```powershell
docker compose up -d
docker compose ps                      # both services must say (healthy)
cd backend
.\mvnw.cmd spring-boot:run
```

**Check:** `Invoke-RestMethod http://localhost:8080/actuator/health` returns `status : UP`.

## B3. Seed zones and pricing in the ERP

The ERP has no API to create zones or prices, and none exist in a fresh database. Without them
**every** create-parcel request fails. Insert 9 zones (one per province) and a price for every
zone pair:

```powershell
cd D:\EADproject\SwiftDrop
Get-Content "D:\ecommerce site\ecommerce\scripts\erp-seed-zones.sql" -Raw |
  docker compose exec -T postgres psql -U swiftdrop -d swiftdrop -f -
```

Save this as `scripts/erp-seed-zones.sql` in the store repo. It's for **local development only**;
real zones come from the SwiftDrop team.

```sql
-- Local development seed for the SwiftDrop ERP. Safe to run more than once.
INSERT INTO zones (id, code, name, active, version, created_at) VALUES
  (gen_random_uuid(), 'WP',  'Western',       TRUE, 0, now()),
  (gen_random_uuid(), 'CP',  'Central',       TRUE, 0, now()),
  (gen_random_uuid(), 'SP',  'Southern',      TRUE, 0, now()),
  (gen_random_uuid(), 'NP',  'Northern',      TRUE, 0, now()),
  (gen_random_uuid(), 'EP',  'Eastern',       TRUE, 0, now()),
  (gen_random_uuid(), 'NWP', 'North Western', TRUE, 0, now()),
  (gen_random_uuid(), 'NCP', 'North Central', TRUE, 0, now()),
  (gen_random_uuid(), 'UVA', 'Uva',           TRUE, 0, now()),
  (gen_random_uuid(), 'SAB', 'Sabaragamuwa',  TRUE, 0, now())
ON CONFLICT (code) DO NOTHING;

INSERT INTO pricing_rules (id, origin_zone_id, destination_zone_id, base_fee, per_kg_fee,
                           small_size_surcharge, medium_size_surcharge, large_size_surcharge,
                           currency, active, version, created_at)
SELECT gen_random_uuid(), o.id, d.id,
       CASE WHEN o.id = d.id THEN 350.00 ELSE 450.00 END, 50.00,
       0.00, 100.00, 250.00, 'LKR', TRUE, 0, now()
FROM zones o CROSS JOIN zones d
ON CONFLICT (origin_zone_id, destination_zone_id) DO NOTHING;

SELECT id, code, name FROM zones ORDER BY code;
```

**Check:** the last `SELECT` prints 9 zones. **Copy the `id` of `WP` (Western).** That's our
warehouse zone (`STORE_PICKUP_ZONE_ID`).

## B4. Create the store's merchant account, API key and webhook

Run in PowerShell. Every value in `<…>` comes from the output of the previous command. Admin
and merchant JWTs expire after **15 minutes**; if you get `401`, log in again.

```powershell
$erp = "http://localhost:8080"

# 1. Register the store as a merchant (public endpoint)
$reg = @{
  fullName = "StrideLK Integration"; businessName = "StrideLK"; registrationNumber = "PV-000123"
  contactEmail = "merchant@stridelk.local"; contactPhone = "+94110000000"; password = "Merchant123!"
} | ConvertTo-Json
Invoke-RestMethod -Method Post "$erp/api/v1/merchants/register" -ContentType "application/json" -Body $reg

# 2. Log in as the ERP admin
$admin = Invoke-RestMethod -Method Post "$erp/api/v1/auth/tokens" -ContentType "application/json" `
  -Body (@{ email = "admin@swiftdrop.local"; password = "Admin12345!" } | ConvertTo-Json)
$A = @{ Authorization = "Bearer $($admin.accessToken)" }

# 3. Find the pending merchant and approve it
$pending = Invoke-RestMethod "$erp/api/v1/admin/merchants?status=PENDING_APPROVAL" -Headers $A
$merchantId = ($pending.items | Where-Object businessName -eq "StrideLK").id
Invoke-RestMethod -Method Patch "$erp/api/v1/admin/merchants/$merchantId/status" -Headers $A `
  -ContentType "application/json" -Body (@{ action = "APPROVE" } | ConvertTo-Json)

# 4. Log in as the merchant user
$m = Invoke-RestMethod -Method Post "$erp/api/v1/auth/tokens" -ContentType "application/json" `
  -Body (@{ email = "merchant@stridelk.local"; password = "Merchant123!" } | ConvertTo-Json)
$M = @{ Authorization = "Bearer $($m.accessToken)" }

# 5. Create the API key. rawKey is shown ONCE. Copy it into the store .env now.
$key = Invoke-RestMethod -Method Post "$erp/api/v1/merchants/me/api-keys" -Headers $M `
  -ContentType "application/json" -Body (@{ label = "store-local" } | ConvertTo-Json)
$key.rawKey                     # → SWIFTDROP_API_KEY

# 6. Make a webhook secret and register our webhook URL
$bytes = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString("x2") })      # 64 hex chars
$secret                         # → SWIFTDROP_WEBHOOK_SECRET
Invoke-RestMethod -Method Post "$erp/api/v1/merchants/me/webhooks" -Headers $M -ContentType "application/json" `
  -Body (@{ url = "http://localhost:3100/api/webhooks/swiftdrop"; secret = $secret } | ConvertTo-Json)

# 7. Create a courier account for end-to-end tests (admin only)
Invoke-RestMethod -Method Post "$erp/api/v1/staff-users" -Headers $A -ContentType "application/json" `
  -Body (@{ fullName = "Test Courier"; email = "courier@swiftdrop.local"; password = "Courier123!"; role = "COURIER" } | ConvertTo-Json)
```

You can do steps 5 and 6 in the ERP frontend instead (`http://localhost:3000/merchant/api-keys`
and `/merchant/webhooks`).

**Check:** this returns `201` and a tracking number (replace the zone IDs with yours from B3):

```powershell
$order = @{
  merchantOrderReference = "SETUP-TEST-1"
  pickup  = @{ contactName = "Warehouse"; phone = "+94110000000"; line1 = "12 Warehouse Rd"; city = "Colombo 10"; zoneId = "<WP zone id>" }
  dropoff = @{ contactName = "Test Buyer"; phone = "+94711234567"; line1 = "4 Lake View"; city = "Kandy"; zoneId = "<CP zone id>" }
  size = "SMALL"; weightGrams = 1000; description = "setup test"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post "$erp/api/v1/merchant-api/orders" -Headers @{ "X-API-Key" = $key.rawKey } `
  -ContentType "application/json" -Body $order
```

Run it a second time: you must get the **same** `parcelId` with `newlyCreated: False`. That
proves idempotency works.

## B5. Create the store project

```powershell
cd "d:\ecommerce site\ecommerce"
npx create-next-app@15 . --ts --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
npm install @prisma/client@6 zod@4 bcryptjs jose server-only
npm install -D prisma@6 tsx vitest @types/bcryptjs
```

If `create-next-app` refuses because the folder isn't empty, move `README.md` and `docs/` out
temporarily, then move them back.

`package.json` scripts:

```json
"scripts": {
  "dev": "next dev --turbopack -p 3100",
  "build": "prisma generate && next build",
  "start": "next start -p 3100",
  "lint": "next lint",
  "test": "vitest run",
  "db:migrate": "prisma migrate dev",
  "db:seed": "prisma db seed",
  "cron:local": "tsx --env-file=.env scripts/cron-local.ts",
  "webhook:send": "tsx --env-file=.env scripts/send-webhook.ts",
  "zones:sync": "tsx --env-file=.env scripts/sync-zones.ts"
},
"prisma": { "seed": "tsx --env-file=.env prisma/seed.ts" }
```

`compose.yaml` (store database only):

```yaml
services:
  store-db:
    image: postgres:18-alpine
    environment:
      POSTGRES_DB: store
      POSTGRES_USER: store
      POSTGRES_PASSWORD: store-local-only
    ports: ["127.0.0.1:5433:5432"]
    volumes: [store-db-data:/var/lib/postgresql/data]
volumes:
  store-db-data:
```

`.env.example` (commit this; copy it to `.env` and fill it in; never commit `.env`):

```dotenv
DATABASE_URL=postgresql://store:store-local-only@localhost:5433/store
AUTH_SECRET=<32+ random characters>
CRON_SECRET=<32+ random characters>
ADMIN_EMAIL=admin@stridelk.local
ADMIN_PASSWORD=<choose one>

# mock = fake SwiftDrop inside the store (no ERP needed). live = real ERP.
SWIFTDROP_MODE=mock
SWIFTDROP_API_URL=http://localhost:8080
SWIFTDROP_API_KEY=
SWIFTDROP_WEBHOOK_SECRET=<same 64-hex secret registered in B4>
SWIFTDROP_TIMEOUT_MS=8000
SWIFTDROP_POLL_INTERVAL_SEC=300

# Only for scripts/sync-zones.ts (the ERP zone list needs a person's login)
SWIFTDROP_MERCHANT_EMAIL=merchant@stridelk.local
SWIFTDROP_MERCHANT_PASSWORD=

STORE_ORDER_REF_PREFIX=SLK
STORE_PICKUP_NAME=StrideLK Warehouse
STORE_PICKUP_PHONE=+94110000000
STORE_PICKUP_LINE1=12 Warehouse Rd
STORE_PICKUP_LINE2=
STORE_PICKUP_CITY=Colombo 10
STORE_PICKUP_POSTAL_CODE=01000
# mock: 00000000-0000-4000-8000-000000000001 · live: the WP zone id from B3
STORE_PICKUP_ZONE_ID=00000000-0000-4000-8000-000000000001
NEXT_PUBLIC_SITE_URL=http://localhost:3100
```

Folder structure you'll end up with:

```
src/
  app/
    api/
      webhooks/swiftdrop/route.ts      ← Step 12
      cron/swiftdrop/route.ts          ← Step 13
      orders/[orderNumber]/status/route.ts  ← Step 16
    actions/{auth,cart,checkout,track,admin}.ts
    admin/{page.tsx, shipments/page.tsx, webhooks/page.tsx}
    orders/[orderNumber]/page.tsx, track/page.tsx, checkout/page.tsx, …
  components/ …                         ← from the example
  lib/
    swiftdrop/
      types.ts errors.ts client.ts live.ts mock.ts signature.ts
      status.ts reference.ts parcel.ts zones.ts
      apply-status.ts booking.ts webhook.ts poller.ts
    env.ts db.ts districts.ts phone.ts cart.ts session.ts …
prisma/schema.prisma, prisma/seed.ts
scripts/cron-local.ts, send-webhook.ts, sync-zones.ts, erp-seed-zones.sql
test/ …                                 ← Part D
```

**Check:** `docker compose up -d`, then `npm run dev` opens `http://localhost:3100`.

---

# Part C: Build (step by step)

## Step 1: Port the store core from the example

Source: `D:\ecommerce site\exampleecommerce\stridelk-store-main\src`

| Copy as-is (then fix imports) | Copy and change | Do **not** copy (rewritten below) |
|---|---|---|
| `lib/db.ts`, `lib/money.ts`, `lib/dates.ts`, `lib/jwt.ts`, `lib/session.ts`, `lib/cookie-options.ts`, `lib/cart.ts`, `lib/catalog.ts`, `lib/order-access.ts`, `middleware.ts` | `lib/validation.ts` (add `postalCode`, phone rule from Step 7, drop `deliveryType`) | everything in `lib/swiftdrop/` |
| `components/` except below | `lib/tracking.ts` (no `ASSIGNED`, uses shipment; Step 16) | `lib/orders.ts` |
| `app/actions/auth.ts`, `cart.ts`, `track.ts` | `app/actions/checkout.ts` (Step 11), `app/actions/admin.ts` (Step 17) | `app/api/webhooks/swiftdrop/route.ts` |
| product, category, cart, login, register pages | `components/CheckoutForm.tsx` (remove Express option, add postal code) | `scripts/send-webhook.ts` |
| `prisma/seed.ts` (products part) | `components/DeliveryTimeline.tsx`, `StatusBadge.tsx` | |

**Check:** you can browse products, add to cart, register and log in. (Checkout comes in
Step 11.)

## Step 2: Database schema

Replace the order/delivery parts of the example's `prisma/schema.prisma` with the following.
Keep `User`, `Category`, `Product`, `ProductVariant`, `Cart`, `CartItem`, `OrderItem` from the
example (`OrderItem.order` stays the same).

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  CUSTOMER
  ADMIN
}

enum ParcelSize {
  SMALL
  MEDIUM
  LARGE
}

/// Same values as SwiftDrop's ParcelStatus. Never add ASSIGNED.
enum DeliveryStatus {
  CREATED
  PICKED_UP
  IN_TRANSIT
  OUT_FOR_DELIVERY
  DELIVERED
  FAILED
}

/// Same values as SwiftDrop's FailureReason.
enum FailureReason {
  RECIPIENT_UNAVAILABLE
  ADDRESS_NOT_FOUND
  REFUSED
  DAMAGED
  OTHER
}

/// The store's view of a shipment.
enum ShipmentState {
  PENDING_BOOKING   // saved in our DB; SwiftDrop hasn't accepted it yet (or we're retrying)
  BOOKED            // SwiftDrop gave us a tracking number; parcel is moving
  NEEDS_ATTENTION   // SwiftDrop rejected it, or retries ran out; a person must look
  DELIVERED
  FAILED
}

enum EventSource {
  BOOKING
  WEBHOOK
  POLL
}

model Order {
  id           String     @id @default(cuid())
  orderNumber  Int        @unique @default(autoincrement())
  userId       String?
  user         User?      @relation(fields: [userId], references: [id])

  // customer + address snapshot (personal data: never log it)
  email        String
  customerName String
  phone        String     // always +94XXXXXXXXX
  line1        String
  line2        String?
  city         String
  district     String
  postalCode   String?
  notes        String?

  subtotal     Int        // whole LKR
  deliveryFee  Int        // what the CUSTOMER pays us (whole LKR)
  total        Int

  items        OrderItem[]
  shipments    Shipment[]
  createdAt    DateTime   @default(now())
  updatedAt    DateTime   @updatedAt

  @@index([email])
}

model Shipment {
  id                String          @id @default(cuid())
  orderId           String
  order             Order           @relation(fields: [orderId], references: [id], onDelete: Cascade)
  attempt           Int             @default(1)
  merchantRef       String          @unique   // "SLK-10045", "SLK-10045-2" … never changes
  state             ShipmentState   @default(PENDING_BOOKING)

  // what we send to SwiftDrop (snapshot taken at checkout)
  dropoffZoneId     String
  parcelSize        ParcelSize
  weightGrams       Int
  description       String

  // what SwiftDrop told us
  parcelId          String?         @unique
  trackingNumber    String?         @unique
  deliveryStatus    DeliveryStatus?
  failureReason     FailureReason?
  courierFee        Decimal?        @db.Decimal(12, 2)  // SwiftDrop's fee = our cost
  bookedAt          DateTime?

  // booking retries
  bookingAttempts   Int             @default(0)
  nextBookingAt     DateTime?       @default(now())
  bookingLeaseUntil DateTime?
  lastBookingError  String?

  lastPolledAt      DateTime?
  events            DeliveryEvent[]
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@unique([orderId, attempt])
  @@index([state, nextBookingAt])
  @@index([state, lastPolledAt])
}

/// One row per status per shipment: the timeline the customer sees.
model DeliveryEvent {
  id            String         @id @default(cuid())
  shipmentId    String
  shipment      Shipment       @relation(fields: [shipmentId], references: [id], onDelete: Cascade)
  status        DeliveryStatus
  failureReason FailureReason?
  sequence      Int?           // from webhooks only
  eventId       String?        // from webhooks only
  source        EventSource
  occurredAt    DateTime
  createdAt     DateTime       @default(now())

  @@unique([shipmentId, status])
}

/// Copy of SwiftDrop zones. id = SwiftDrop's zone UUID.
model DeliveryZone {
  id        String         @id
  code      String         @unique
  name      String
  active    Boolean        @default(true)
  syncedAt  DateTime       @default(now())
  districts DistrictZone[]
  rates     DeliveryRate[]
}

/// Which SwiftDrop zone serves each Sri Lankan district.
model DistrictZone {
  district String       @id   // e.g. "Kandy"
  zoneId   String
  zone     DeliveryZone @relation(fields: [zoneId], references: [id])
}

/// What the store charges the customer for delivery (admin-editable).
model DeliveryRate {
  id     String       @id @default(cuid())
  zoneId String
  zone   DeliveryZone @relation(fields: [zoneId], references: [id])
  size   ParcelSize
  fee    Int          // whole LKR

  @@unique([zoneId, size])
}

/// Every webhook we received. eventId is set ONLY for PROCESSED rows (it's the dedupe key).
model WebhookLog {
  id             String   @id @default(cuid())
  eventId        String?  @unique
  rawEventId     String?
  eventType      String?
  signatureValid Boolean
  result         String   // PROCESSED | REJECTED | IGNORED | ERROR
  error          String?
  payload        Json?    // SwiftDrop payloads contain no personal data
  receivedAt     DateTime @default(now())

  @@index([receivedAt])
}
```

In `User`, keep `orders Order[]`. Remove the example's `OrderStatus`, `DeliveryType` and the old
`WebhookEvent` model.

Seed (`prisma/seed.ts`), in addition to products and the admin user: in **mock mode** insert 9
zones with fixed IDs `00000000-0000-4000-8000-00000000000N` (N = 1…9, codes `WP, CP, SP, NP, EP,
NWP, NCP, UVA, SAB`), map every district to its province zone (use `DISTRICTS` from Step 7), and
add `DeliveryRate` rows (for example `WP`: 350/400/550, others: 450/500/700 for
SMALL/MEDIUM/LARGE). In live mode, zones come from Step 15 instead.

```powershell
npx prisma migrate dev --name init
npx prisma db seed
```

**Check:** `npx prisma studio` shows the tables, 9 zones, 25 district mappings and rates.

## Step 3: Environment config

`src/lib/env.ts` validates settings once, on first use, with a readable error:

```ts
import "server-only";
import { z } from "zod";

const schema = z
  .object({
    SWIFTDROP_MODE: z.enum(["mock", "live"]).default("mock"),
    SWIFTDROP_API_URL: z.string().url().default("http://localhost:8080"),
    SWIFTDROP_API_KEY: z.string().default(""),
    SWIFTDROP_WEBHOOK_SECRET: z.string().min(16, "must be at least 16 characters"),
    SWIFTDROP_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    SWIFTDROP_POLL_INTERVAL_SEC: z.coerce.number().int().min(30).default(300),
    CRON_SECRET: z.string().min(16),
    STORE_ORDER_REF_PREFIX: z.string().regex(/^[A-Z]{2,10}$/).default("SLK"),
    STORE_PICKUP_NAME: z.string().min(1).max(200),
    STORE_PICKUP_PHONE: z.string().regex(/^\+94\d{9}$/, "must look like +94XXXXXXXXX"),
    STORE_PICKUP_LINE1: z.string().min(1).max(200),
    STORE_PICKUP_LINE2: z.string().max(200).optional().transform((v) => v || null),
    STORE_PICKUP_CITY: z.string().min(1).max(100),
    STORE_PICKUP_POSTAL_CODE: z.string().max(10).optional().transform((v) => v || null),
    STORE_PICKUP_ZONE_ID: z.string().uuid(),
  })
  .superRefine((e, ctx) => {
    if (e.SWIFTDROP_MODE === "live" && !e.SWIFTDROP_API_KEY.startsWith("sd_live_")) {
      ctx.addIssue({ code: "custom", path: ["SWIFTDROP_API_KEY"], message: "live mode needs the sd_live_… key (Part B4)" });
    }
  });

export type Env = z.infer<typeof schema>;
let cached: Env | undefined;

/** Call env() inside functions, not at module top level, so `next build` works without secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid store configuration:\n${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
```

**Check:** start the app with `SWIFTDROP_WEBHOOK_SECRET` empty and open checkout. You get a
clear error naming the variable.

## Step 4: ERP types and schemas

`src/lib/swiftdrop/types.ts`. These mirror the ERP's Java records. If the ERP changes a record,
this is the file to update.

```ts
import { z } from "zod";

export const PARCEL_STATUSES = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED"] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

export const FAILURE_REASONS = ["RECIPIENT_UNAVAILABLE", "ADDRESS_NOT_FOUND", "REFUSED", "DAMAGED", "OTHER"] as const;
export type FailureReasonCode = (typeof FAILURE_REASONS)[number];

export type ParcelSize = "SMALL" | "MEDIUM" | "LARGE";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a date");

/** ERP: merchant.web.MerchantOrderAddress */
export type MerchantOrderAddress = {
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  zoneId: string;
  postalCode: string | null;
};

/** ERP: merchant.web.CreateMerchantOrderRequest */
export type CreateMerchantOrderRequest = {
  merchantOrderReference: string;
  pickup: MerchantOrderAddress;
  dropoff: MerchantOrderAddress;
  size: ParcelSize;
  weightGrams: number;
  description: string | null;
};

/** ERP: merchant.web.MerchantOrderResponse */
export const merchantOrderResponseSchema = z.object({
  parcelId: z.string().uuid(),
  trackingNumber: z.string().regex(/^SD[0-9A-HJKMNP-TV-Z]{10}$/),
  status: z.enum(PARCEL_STATUSES),
  feeAmount: z.union([z.number(), z.string()]).transform((v) => String(v)),
  feeCurrency: z.string(),
  createdAt: isoDate,
  newlyCreated: z.boolean(),
});
export type MerchantOrderResponse = z.infer<typeof merchantOrderResponseSchema>;

/** ERP: delivery.api.PublicTrackingView */
export const publicTrackingSchema = z.object({
  trackingNumber: z.string(),
  status: z.enum(PARCEL_STATUSES),
  pickupCity: z.string().nullish(),
  dropoffCity: z.string().nullish(),
  history: z.array(z.object({ status: z.enum(PARCEL_STATUSES), occurredAt: isoDate })),
});
export type PublicTracking = z.infer<typeof publicTrackingSchema>;

/** ERP: delivery.api.ParcelStatusChanged (+ ParcelStatusChangedData). Unknown fields are ignored. */
export const statusChangedEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  schemaVersion: z.number().int(),
  occurredAt: isoDate,
  producer: z.string(),
  data: z.object({
    parcelId: z.string().uuid(),
    trackingNumber: z.string(),
    previousStatus: z.enum(PARCEL_STATUSES).nullable(),
    newStatus: z.enum(PARCEL_STATUSES),
    sequence: z.number().int().min(1),
    source: z.string(),
    ownerMerchantId: z.string().nullish(),
    merchantOrderReference: z.string().nullable(),
    failureReasonCode: z.enum(FAILURE_REASONS).nullable(),
  }),
});
export type StatusChangedEvent = z.infer<typeof statusChangedEventSchema>;

export const STATUS_CHANGED = "parcel.status-changed";
```

**Check:** `npx tsc --noEmit` passes.

## Step 5: Errors and the live client

`src/lib/swiftdrop/errors.ts`:

```ts
/** RETRYABLE = try again later. REJECTED = our request is wrong. AUTH = key/merchant problem. */
export type FailureKind = "RETRYABLE" | "REJECTED" | "AUTH";

export class SwiftDropError extends Error {
  constructor(message: string, readonly kind: FailureKind, readonly httpStatus?: number) {
    super(message);
    this.name = "SwiftDropError";
  }
}

export function kindForStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return "AUTH";
  if (status >= 500 || status === 408 || status === 429) return "RETRYABLE";
  return "REJECTED";
}
```

`src/lib/swiftdrop/client.ts` (the interface everything else uses):

```ts
import "server-only";
import { env } from "@/lib/env";
import { LiveSwiftDropClient } from "./live";
import { mockClient } from "./mock";
import type { CreateMerchantOrderRequest, MerchantOrderResponse, PublicTracking } from "./types";

export interface SwiftDropClient {
  readonly mode: "mock" | "live";
  /** Resolves on 200/201. Throws SwiftDropError otherwise. */
  createOrder(req: CreateMerchantOrderRequest): Promise<MerchantOrderResponse>;
  /** Returns null when SwiftDrop doesn't know the tracking number (404). */
  getTracking(trackingNumber: string): Promise<PublicTracking | null>;
}

export function swiftDrop(): SwiftDropClient {
  const e = env();
  return e.SWIFTDROP_MODE === "live"
    ? new LiveSwiftDropClient(e.SWIFTDROP_API_URL, e.SWIFTDROP_API_KEY, e.SWIFTDROP_TIMEOUT_MS)
    : mockClient;
}
```

`src/lib/swiftdrop/live.ts`:

```ts
import "server-only";
import type { SwiftDropClient } from "./client";
import { SwiftDropError, kindForStatus } from "./errors";
import {
  merchantOrderResponseSchema, publicTrackingSchema,
  type CreateMerchantOrderRequest, type MerchantOrderResponse, type PublicTracking,
} from "./types";

export class LiveSwiftDropClient implements SwiftDropClient {
  readonly mode = "live" as const;

  constructor(private readonly baseUrl: string, private readonly apiKey: string, private readonly timeoutMs: number) {}

  private async send(path: string, init: { method: string; body?: unknown; withKey?: boolean }): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.withKey) headers["X-API-Key"] = this.apiKey; // only on /merchant-api/** calls
    try {
      return await fetch(this.baseUrl.replace(/\/+$/, "") + path, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
        redirect: "error",
      });
    } catch (e) {
      // timeout, DNS, connection refused …
      throw new SwiftDropError(`SwiftDrop unreachable: ${(e as Error).message}`, "RETRYABLE");
    }
  }

  private async fail(res: Response): Promise<never> {
    const text = await res.text().catch(() => "");
    let detail = res.statusText;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string };
      detail = problem.detail ?? problem.title ?? detail;
    } catch { /* body was not JSON */ }
    throw new SwiftDropError(`SwiftDrop ${res.status}: ${String(detail).slice(0, 300)}`, kindForStatus(res.status), res.status);
  }

  async createOrder(req: CreateMerchantOrderRequest): Promise<MerchantOrderResponse> {
    const res = await this.send("/api/v1/merchant-api/orders", { method: "POST", body: req, withKey: true });
    if (res.status !== 200 && res.status !== 201) return this.fail(res);
    const parsed = merchantOrderResponseSchema.safeParse(await res.json().catch(() => null));
    // Safe to retry: the same reference returns the same parcel.
    if (!parsed.success) throw new SwiftDropError("Unexpected create-order response shape", "RETRYABLE", res.status);
    return parsed.data;
  }

  async getTracking(trackingNumber: string): Promise<PublicTracking | null> {
    const res = await this.send(`/api/v1/tracked-parcels/${encodeURIComponent(trackingNumber)}`, { method: "GET" });
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res);
    const parsed = publicTrackingSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new SwiftDropError("Unexpected tracking response shape", "RETRYABLE", res.status);
    return parsed.data;
  }
}
```

**Check:** in a scratch script with `SWIFTDROP_MODE=live`, `createOrder` with the B4 test body
returns a parcel. A wrong key throws a `SwiftDropError` with `kind: "AUTH"`.

## Step 6: Mock client

The mock lets everyone build and demo the store without the ERP running. It behaves like the
real API: same reference → same parcel, and tracking numbers in the real format.

`src/lib/swiftdrop/mock.ts`:

```ts
import "server-only";
import { createHash } from "crypto";
import type { SwiftDropClient } from "./client";
import { SwiftDropError } from "./errors";
import type { CreateMerchantOrderRequest, MerchantOrderResponse } from "./types";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // same characters SwiftDrop uses

function digest(ref: string) {
  return createHash("sha256").update(ref).digest();
}

/** Deterministic, so a restarted dev server returns the same parcel for the same reference. */
function fakeParcel(ref: string): MerchantOrderResponse {
  const h = digest(ref);
  const tracking = "SD" + Array.from(h.subarray(0, 10), (b) => ALPHABET[b % 32]).join("");
  const hex = h.toString("hex");
  const parcelId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return { parcelId, trackingNumber: tracking, status: "CREATED", feeAmount: "450.00", feeCurrency: "LKR",
           createdAt: new Date().toISOString(), newlyCreated: true };
}

const g = globalThis as unknown as { __swiftdropMock?: Set<string> };
const seen = (g.__swiftdropMock ??= new Set<string>());

export const mockClient: SwiftDropClient = {
  mode: "mock",
  async createOrder(req: CreateMerchantOrderRequest) {
    if (process.env.SWIFTDROP_MOCK_FAIL === "true") {
      throw new SwiftDropError("Mock: SwiftDrop is down", "RETRYABLE", 503);
    }
    const parcel = fakeParcel(req.merchantOrderReference);
    const replay = seen.has(req.merchantOrderReference);
    seen.add(req.merchantOrderReference);
    return { ...parcel, newlyCreated: !replay };
  },
  async getTracking() {
    return null; // in mock mode, status changes come from scripts/send-webhook.ts (Step 14)
  },
};
```

**Check:** two calls with the same reference give the same `trackingNumber`; the second has
`newlyCreated: false`.

## Step 7: Helpers

`src/lib/swiftdrop/reference.ts`:

```ts
import "server-only";
import { env } from "@/lib/env";

/**
 * Our ID for a SwiftDrop parcel. It is DERIVED, never random, so a retry always sends the same
 * reference and SwiftDrop never creates a duplicate.
 * ⚠️ Never change STORE_ORDER_REF_PREFIX after go-live: old parcels would stop matching.
 */
export function merchantRefFor(orderNumber: number, attempt: number): string {
  const base = `${env().STORE_ORDER_REF_PREFIX}-${orderNumber}`;
  return attempt === 1 ? base : `${base}-${attempt}`;
}
```

`src/lib/swiftdrop/parcel.ts`:

```ts
import type { ParcelSize } from "./types";

const GRAMS_PER_PAIR = 1100;   // shoe + box
const PACKAGING_GRAMS = 300;
export const MAX_PAIRS_PER_PARCEL = 20; // 20 × 1100 + 300 = 22.3 kg (SwiftDrop max is 30 kg)

export function parcelFor(pairs: number): { size: ParcelSize; weightGrams: number } {
  if (!Number.isInteger(pairs) || pairs < 1) throw new Error("A parcel needs at least one pair");
  if (pairs > MAX_PAIRS_PER_PARCEL) throw new Error(`At most ${MAX_PAIRS_PER_PARCEL} pairs per order`);
  const size: ParcelSize = pairs === 1 ? "SMALL" : pairs <= 4 ? "MEDIUM" : "LARGE";
  return { size, weightGrams: pairs * GRAMS_PER_PAIR + PACKAGING_GRAMS };
}
```

`src/lib/phone.ts` (SwiftDrop allows ≤ 20 chars; we always send the same format):

```ts
/** "0711234567", "711234567", "+94 71 123 4567" → "+94711234567". Returns null if not a Sri Lankan number. */
export function normalizeLkPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+94|0094|94|0)?(\d{9})$/);
  return m ? `+94${m[1]}` : null;
}
```

Use it in `checkoutSchema` (`lib/validation.ts`):
`phone: z.string().transform((v, ctx) => normalizeLkPhone(v) ?? (ctx.addIssue({ code: "custom", message: "Enter a Sri Lankan mobile number" }), z.NEVER))`.
Also add `postalCode: z.string().trim().max(10).optional()` and limit `line1`/`line2` to 200,
`city` to 100 and `customerName` to 200.

`src/lib/districts.ts` (missing from the example):

```ts
export const DISTRICTS = {
  Colombo: "WP", Gampaha: "WP", Kalutara: "WP",
  Kandy: "CP", Matale: "CP", "Nuwara Eliya": "CP",
  Galle: "SP", Matara: "SP", Hambantota: "SP",
  Jaffna: "NP", Kilinochchi: "NP", Mannar: "NP", Vavuniya: "NP", Mullaitivu: "NP",
  Batticaloa: "EP", Ampara: "EP", Trincomalee: "EP",
  Kurunegala: "NWP", Puttalam: "NWP",
  Anuradhapura: "NCP", Polonnaruwa: "NCP",
  Badulla: "UVA", Monaragala: "UVA",
  Ratnapura: "SAB", Kegalle: "SAB",
} as const;

export type District = keyof typeof DISTRICTS;
export const DISTRICT_NAMES = Object.keys(DISTRICTS) as District[];
export const isDistrict = (v: string): v is District => Object.hasOwn(DISTRICTS, v);
```

`src/lib/swiftdrop/zones.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import type { ParcelSize } from "./types";

/** SwiftDrop zone for a district, or null if we don't deliver there. */
export async function zoneForDistrict(district: string) {
  const row = await db.districtZone.findUnique({ where: { district }, include: { zone: true } });
  return row && row.zone.active ? row.zone : null;
}

/** What the customer pays for delivery. Falls back to a safe default if no rate is set. */
export async function customerDeliveryFee(zoneId: string, size: ParcelSize): Promise<number> {
  const rate = await db.deliveryRate.findUnique({ where: { zoneId_size: { zoneId, size } } });
  return rate?.fee ?? 700;
}
```

**Check:** unit tests in D1 for `parcelFor`, `normalizeLkPhone` and `merchantRefFor` pass.

## Step 8: Status rules

`src/lib/swiftdrop/status.ts`. **Why ranks work:** SwiftDrop only ever moves a parcel one step
forward, and `DELIVERED`/`FAILED` are final. So "is this news newer than what we have?" is the
same as "is this status further along the path?". That's true whether the news came from a
webhook (which has a `sequence`) or from polling (which doesn't).

```ts
import type { DeliveryStatus, ShipmentState } from "@prisma/client";

const RANK: Record<DeliveryStatus, number> = {
  CREATED: 1, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 9, FAILED: 9,
};

export const isTerminal = (s: DeliveryStatus | null | undefined) => s === "DELIVERED" || s === "FAILED";

/** Should a shipment currently at `current` move to `next`? */
export function shouldMoveTo(current: DeliveryStatus | null, next: DeliveryStatus): boolean {
  if (current === null) return true;
  if (isTerminal(current)) return false;          // final: nothing moves it
  return RANK[next] > RANK[current];              // forward only
}

export function shipmentStateFor(status: DeliveryStatus): ShipmentState {
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "FAILED") return "FAILED";
  return "BOOKED";
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  CREATED: "Delivery booked with SwiftDrop",
  PICKED_UP: "Picked up from our warehouse",
  IN_TRANSIT: "On the way to your area",
  OUT_FOR_DELIVERY: "Out for delivery. Keep your phone nearby!",
  DELIVERED: "Delivered",
  FAILED: "Delivery unsuccessful",
};

export const FAILURE_TEXT: Record<string, string> = {
  RECIPIENT_UNAVAILABLE: "The courier couldn't reach you at the address.",
  ADDRESS_NOT_FOUND: "The courier couldn't find the address.",
  REFUSED: "The parcel was refused at delivery.",
  DAMAGED: "The parcel was damaged in transit.",
  OTHER: "The delivery couldn't be completed.",
};
```

**Check:** D1 tests for `shouldMoveTo` pass (all cases in the table there).

## Step 9: `applyStatus` (the most important function)

`src/lib/swiftdrop/apply-status.ts`. Everything that learns a status calls this, inside a DB
transaction.

```ts
import "server-only";
import type { DeliveryStatus, EventSource, FailureReason, Prisma } from "@prisma/client";
import { shipmentStateFor, shouldMoveTo } from "./status";

export type StatusNews = {
  status: DeliveryStatus;
  occurredAt: Date;
  source: EventSource;
  failureReason?: FailureReason | null;
  sequence?: number | null;
  eventId?: string | null;
};

/**
 * Records a status for a shipment and moves it forward if the news is newer.
 * MUST be called inside db.$transaction(async (tx) => …).
 */
export async function applyStatus(tx: Prisma.TransactionClient, shipmentId: string, news: StatusNews) {
  // 1. Lock the row: a webhook and the poller can't update the same shipment at the same moment.
  await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id = ${shipmentId} FOR UPDATE`;
  const current = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { deliveryStatus: true, failureReason: true },
  });

  // 2. Timeline: one row per status. A repeat (webhook + poll for the same status) is skipped.
  await tx.deliveryEvent.createMany({
    data: [{
      shipmentId,
      status: news.status,
      failureReason: news.failureReason ?? null,
      sequence: news.sequence ?? null,
      eventId: news.eventId ?? null,
      source: news.source,
      occurredAt: news.occurredAt,
    }],
    skipDuplicates: true,
  });

  // 3. Move forward only.
  const moved = shouldMoveTo(current.deliveryStatus, news.status);
  if (moved) {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        deliveryStatus: news.status,
        state: shipmentStateFor(news.status),
        failureReason: news.status === "FAILED" ? news.failureReason ?? null : null,
      },
    });
  } else if (news.status === "FAILED" && current.deliveryStatus === "FAILED" && !current.failureReason && news.failureReason) {
    // Polling saw FAILED first (no reason in the public view); a webhook now tells us why.
    await tx.shipment.update({ where: { id: shipmentId }, data: { failureReason: news.failureReason } });
    await tx.deliveryEvent.updateMany({ where: { shipmentId, status: "FAILED" }, data: { failureReason: news.failureReason } });
  }
  return { moved };
}
```

**Check:** D1 ordering tests pass (events arriving 3, 2, 4 end at 4; duplicates make one
timeline row).

## Step 10: Booking

`src/lib/swiftdrop/booking.ts`:

```ts
import "server-only";
import type { Order, Shipment } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { applyStatus } from "./apply-status";
import { swiftDrop } from "./client";
import { SwiftDropError, type FailureKind } from "./errors";
import type { CreateMerchantOrderRequest } from "./types";

const MAX_ATTEMPTS = 10;
const LEASE_MS = 60_000;

/** 1, 2, 4, 8 … minutes, capped at 60, plus up to 30 s of random jitter. */
function backoffMs(attempt: number) {
  return Math.min(60, 2 ** (attempt - 1)) * 60_000 + Math.floor(Math.random() * 30_000);
}

export function buildCreateRequest(s: Shipment & { order: Order }): CreateMerchantOrderRequest {
  const e = env();
  const o = s.order;
  return {
    merchantOrderReference: s.merchantRef,
    pickup: {
      contactName: e.STORE_PICKUP_NAME, phone: e.STORE_PICKUP_PHONE,
      line1: e.STORE_PICKUP_LINE1, line2: e.STORE_PICKUP_LINE2,
      city: e.STORE_PICKUP_CITY, zoneId: e.STORE_PICKUP_ZONE_ID, postalCode: e.STORE_PICKUP_POSTAL_CODE,
    },
    dropoff: {
      contactName: o.customerName, phone: o.phone,
      line1: o.line1, line2: o.line2 ?? null,
      city: o.city, zoneId: s.dropoffZoneId, postalCode: o.postalCode ?? null,
    },
    size: s.parcelSize,
    weightGrams: s.weightGrams,
    description: s.description.slice(0, 200),
  };
}

export type BookResult =
  | { ok: true; trackingNumber: string }
  | { ok: false; kind: FailureKind | "SKIPPED"; message: string };

/**
 * Sends one shipment to SwiftDrop. Safe to call any number of times, from anywhere.
 * Never throws for SwiftDrop problems: it records them and schedules a retry.
 */
export async function bookShipment(shipmentId: string): Promise<BookResult> {
  const now = new Date();

  // 1. Claim it, so checkout and cron don't book the same shipment at the same moment.
  const claim = await db.shipment.updateMany({
    where: {
      id: shipmentId,
      trackingNumber: null,
      state: { in: ["PENDING_BOOKING", "NEEDS_ATTENTION"] },
      OR: [{ bookingLeaseUntil: null }, { bookingLeaseUntil: { lt: now } }],
    },
    data: { bookingLeaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (claim.count === 0) return { ok: false, kind: "SKIPPED", message: "Already booked or being booked" };

  const s = await db.shipment.findUniqueOrThrow({ where: { id: shipmentId }, include: { order: true } });

  try {
    const res = await swiftDrop().createOrder(buildCreateRequest(s));

    await db.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: s.id },
        data: {
          parcelId: res.parcelId,
          trackingNumber: res.trackingNumber,
          courierFee: res.feeAmount,
          bookedAt: new Date(),
          bookingAttempts: { increment: 1 },
          lastBookingError: null,
          nextBookingAt: null,
          bookingLeaseUntil: null,
        },
      });
      // A replay (200) can return a later status, e.g. PICKED_UP.
      await applyStatus(tx, s.id, {
        status: res.status,
        occurredAt: res.status === "CREATED" ? new Date(res.createdAt) : new Date(),
        source: "BOOKING",
      });
    });
    return { ok: true, trackingNumber: res.trackingNumber };
  } catch (e) {
    const err = e instanceof SwiftDropError ? e : new SwiftDropError(String(e), "RETRYABLE");
    const attempts = s.bookingAttempts + 1;
    const giveUp = err.kind !== "RETRYABLE" || attempts >= MAX_ATTEMPTS;
    await db.shipment.update({
      where: { id: s.id },
      data: {
        bookingAttempts: attempts,
        lastBookingError: err.message.slice(0, 500),
        bookingLeaseUntil: null,
        state: giveUp ? "NEEDS_ATTENTION" : "PENDING_BOOKING",
        nextBookingAt: giveUp ? null : new Date(Date.now() + backoffMs(attempts)),
      },
    });
    console.error(`[swiftdrop] booking ${s.merchantRef} failed (${err.kind}, attempt ${attempts}): ${err.message}`);
    return { ok: false, kind: err.kind, message: err.message };
  }
}

/** Called by cron: books every shipment whose retry time has come. */
export async function retryDueBookings(limit = 20) {
  const due = await db.shipment.findMany({
    where: { state: "PENDING_BOOKING", nextBookingAt: { lte: new Date() } },
    orderBy: { nextBookingAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let booked = 0;
  for (const s of due) if ((await bookShipment(s.id)).ok) booked++;
  return { due: due.length, booked };
}
```

**Check (mock):** book a shipment twice. One tracking number, one `CREATED` timeline row.
With `SWIFTDROP_MOCK_FAIL=true` the shipment stays `PENDING_BOOKING` with `nextBookingAt` about
1 minute ahead and `lastBookingError` filled in.

## Step 11: Checkout wiring

`src/app/actions/checkout.ts`: adapt the example's `placeOrder`. The key changes:

```ts
"use server";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCart, summarizeCart } from "@/lib/cart";
import { grantOrderAccess } from "@/lib/order-access";
import { getSession } from "@/lib/session";
import { checkoutSchema, fieldErrors } from "@/lib/validation";
import { bookShipment } from "@/lib/swiftdrop/booking";
import { parcelFor, MAX_PAIRS_PER_PARCEL } from "@/lib/swiftdrop/parcel";
import { merchantRefFor } from "@/lib/swiftdrop/reference";
import { customerDeliveryFee, zoneForDistrict } from "@/lib/swiftdrop/zones";

// … CheckoutState, OutOfStockError, FIELDS as in the example (remove "deliveryType", add "postalCode")

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  // 1. validate form (as example) → data
  // 2. load cart (as example) → items, subtotal, itemCount

  if (itemCount > MAX_PAIRS_PER_PARCEL) {
    return { errors: { form: `We can ship at most ${MAX_PAIRS_PER_PARCEL} pairs per order.` }, values };
  }
  const zone = await zoneForDistrict(data.district);
  if (!zone) return { errors: { district: "Sorry, we don't deliver to this district yet." }, values };

  const { size, weightGrams } = parcelFor(itemCount);
  const deliveryFee = await customerDeliveryFee(zone.id, size);
  const session = await getSession();

  const { order, shipmentId } = await db.$transaction(async (tx) => {
    // reserve stock exactly as in the example (updateMany with stock >= quantity)
    const order = await tx.order.create({
      data: {
        userId: session?.userId ?? null,
        email: data.email, customerName: data.customerName, phone: data.phone,
        line1: data.line1, line2: data.line2 ?? null, city: data.city, district: data.district,
        postalCode: data.postalCode ?? null, notes: data.notes ?? null,
        subtotal, deliveryFee, total: subtotal + deliveryFee,
        items: { create: /* as example */ [] },
      },
      select: { id: true, orderNumber: true },
    });
    const shipment = await tx.shipment.create({
      data: {
        orderId: order.id,
        attempt: 1,
        merchantRef: merchantRefFor(order.orderNumber, 1),
        dropoffZoneId: zone.id,
        parcelSize: size,
        weightGrams,
        description: `Shoes x${itemCount} (order #${order.orderNumber})`,
      },
      select: { id: true },
    });
    await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
    return { order, shipmentId: shipment.id };
  }, { timeout: 15000, maxWait: 10000 });

  // Book with SwiftDrop AFTER the response is sent, so the customer doesn't wait.
  // If this fails or the server restarts, cron retries it (Step 13).
  after(() => bookShipment(shipmentId));

  await grantOrderAccess(order.id);
  revalidatePath("/", "layout");
  redirect(`/orders/${order.orderNumber}`);
}
```

Replace the example's `getDeliveryQuote` with one that calls `zoneForDistrict` +
`parcelFor` + `customerDeliveryFee` (no SwiftDrop call). Remove the Express option from
`CheckoutForm.tsx`.

**Check (mock):** place an order. The order page shows "Booking delivery", then (after a
refresh) a tracking number `SD…` and the `CREATED` step. In the DB: one `Order`, one
`Shipment` (`BOOKED`, `merchantRef = SLK-<orderNumber>`), one `DeliveryEvent`.

## Step 12: Webhook receiver

`src/lib/swiftdrop/signature.ts`:

```ts
import { createHmac, timingSafeEqual } from "crypto";

export const TOLERANCE_SECONDS = 300;

/** "v1=" + hex HMAC-SHA256(secret, "<timestamp>.<rawBody>"), exactly as ADR 0004 §7.2 */
export function signV1(secret: string, timestamp: string, rawBody: string): string {
  return "v1=" + createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function verifyV1(input: {
  rawBody: string; timestamp: string; signatureHeader: string; secret: string; nowMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const { rawBody, timestamp, signatureHeader, secret, nowMs = Date.now() } = input;
  if (!timestamp || !signatureHeader) return { ok: false, reason: "Missing signature headers" };
  if (!/^\d{9,11}$/.test(timestamp)) return { ok: false, reason: "Timestamp must be Unix seconds" };
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp outside the 5-minute window" };
  }
  const expected = signV1(secret, timestamp, rawBody);
  // Accept a list ("v1=…, v2=…") so SwiftDrop can add a new scheme later without breaking us.
  const candidates = signatureHeader.split(",").map((s) => s.trim()).filter((s) => s.startsWith("v1="));
  return candidates.some((c) => safeEqual(c, expected)) ? { ok: true } : { ok: false, reason: "Invalid signature" };
}
```

> **Confirm with the ERP team** when they build the sender: the HMAC key is the UTF-8 bytes of
> the secret string we registered (their code Base64-encodes that string for storage and must
> decode it back before signing). The D1 fixture test pins this assumption.

`src/lib/swiftdrop/webhook.ts`:

```ts
import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyStatus } from "./apply-status";
import type { StatusChangedEvent } from "./types";

type LogInput = {
  rawEventId?: string | null; eventType?: string | null; signatureValid: boolean;
  result: "REJECTED" | "IGNORED" | "ERROR"; error?: string | null; payload?: unknown;
};

/** Never throws: logging must not break the HTTP response. */
export async function logWebhook(i: LogInput) {
  try {
    await db.webhookLog.create({
      data: {
        rawEventId: i.rawEventId ?? null, eventType: i.eventType ?? null, signatureValid: i.signatureValid,
        result: i.result, error: i.error?.slice(0, 500) ?? null,
        payload: i.payload === undefined ? Prisma.JsonNull : (i.payload as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error("[webhook] could not write log:", e);
  }
}

export async function handleStatusEvent(ev: StatusChangedEvent): Promise<{ http: number; body: Record<string, unknown> }> {
  const d = ev.data;

  // 1. Find our shipment: by our reference first (exists even before the booking response was saved).
  const shipment = await db.shipment.findFirst({
    where: { OR: [...(d.merchantOrderReference ? [{ merchantRef: d.merchantOrderReference }] : []), { trackingNumber: d.trackingNumber }] },
    select: { id: true, trackingNumber: true },
  });
  if (!shipment) {
    // Not ours (or an old reference). 200 so SwiftDrop doesn't mark it as a failed delivery.
    await logWebhook({ rawEventId: ev.eventId, eventType: ev.eventType, signatureValid: true, result: "IGNORED", error: "Unknown shipment", payload: ev });
    return { http: 200, body: { ok: true, ignored: "unknown shipment" } };
  }

  // 2. Claim the event ID and apply, all-or-nothing.
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.webhookLog.create({
        data: { eventId: ev.eventId, rawEventId: ev.eventId, eventType: ev.eventType, signatureValid: true,
                result: "PROCESSED", payload: ev as unknown as Prisma.InputJsonValue },
      });
      if (!shipment.trackingNumber) {
        await tx.shipment.update({ where: { id: shipment.id }, data: { trackingNumber: d.trackingNumber, parcelId: d.parcelId } });
      }
      return applyStatus(tx, shipment.id, {
        status: d.newStatus, occurredAt: new Date(ev.occurredAt), source: "WEBHOOK",
        failureReason: d.failureReasonCode, sequence: d.sequence, eventId: ev.eventId,
      });
    });
    return { http: 200, body: { ok: true, moved: result.moved } };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002" && String(e.meta?.target ?? "").includes("eventId")) {
      return { http: 200, body: { ok: true, duplicate: true } };
    }
    console.error("[webhook] apply failed:", e);
    await logWebhook({ rawEventId: ev.eventId, eventType: ev.eventType, signatureValid: true, result: "ERROR", error: String(e) });
    return { http: 500, body: { error: "Internal error" } }; // 5xx → SwiftDrop retries
  }
}
```

`src/app/api/webhooks/swiftdrop/route.ts`:

```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyV1 } from "@/lib/swiftdrop/signature";
import { STATUS_CHANGED, statusChangedEventSchema } from "@/lib/swiftdrop/types";
import { handleStatusEvent, logWebhook } from "@/lib/swiftdrop/webhook";

export const runtime = "nodejs";        // needs Node's crypto
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
  const rawBody = await req.text();      // RAW text: the signature covers these exact bytes
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) return NextResponse.json({ error: "Too large" }, { status: 413 });

  const h = (name: string) => req.headers.get(name) ?? "";
  const headerEventId = h("x-swiftdrop-event-id") || null;

  // 1. Signature + timestamp, BEFORE parsing anything
  const sig = verifyV1({ rawBody, timestamp: h("x-swiftdrop-timestamp"), signatureHeader: h("x-swiftdrop-signature"),
                         secret: env().SWIFTDROP_WEBHOOK_SECRET });
  if (!sig.ok) {
    await logWebhook({ rawEventId: headerEventId, eventType: h("x-swiftdrop-event-type") || null, signatureValid: false, result: "REJECTED", error: sig.reason });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. Shape
  let json: unknown;
  try { json = JSON.parse(rawBody); } catch {
    await logWebhook({ rawEventId: headerEventId, signatureValid: true, result: "REJECTED", error: "Body is not JSON" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = statusChangedEventSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logWebhook({ rawEventId: headerEventId, signatureValid: true, result: "REJECTED", error: msg, payload: json });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const ev = parsed.data;
  if (headerEventId && headerEventId !== ev.eventId) {
    await logWebhook({ rawEventId: headerEventId, signatureValid: true, result: "REJECTED", error: "Header/body eventId mismatch" });
    return NextResponse.json({ error: "Event ID mismatch" }, { status: 400 });
  }

  // 3. Only the event we understand; acknowledge others so they don't pile up as failures
  if (ev.eventType !== STATUS_CHANGED || ev.schemaVersion !== 1) {
    await logWebhook({ rawEventId: ev.eventId, eventType: ev.eventType, signatureValid: true, result: "IGNORED", payload: ev });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 4. Apply
  const r = await handleStatusEvent(ev);
  return NextResponse.json(r.body, { status: r.http });
}
```

Make sure `middleware.ts` doesn't protect `/api/webhooks/*` or `/api/cron/*` with the store's
login. They have their own checks.

**Check:** Step 14's simulator moves an order through every status; a wrong secret gives
`401`; sending the same event twice gives `{ duplicate: true }`.

## Step 13: Poller and cron

`src/lib/swiftdrop/poller.ts`:

```ts
import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { applyStatus } from "./apply-status";
import { swiftDrop } from "./client";

/** Asks SwiftDrop for the status of shipments that are moving and haven't been checked recently. */
export async function pollOpenShipments(limit = 50) {
  const cutoff = new Date(Date.now() - env().SWIFTDROP_POLL_INTERVAL_SEC * 1000);
  const due = await db.shipment.findMany({
    where: { state: "BOOKED", trackingNumber: { not: null }, OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: cutoff } }] },
    orderBy: { lastPolledAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, trackingNumber: true, merchantRef: true },
  });

  let moved = 0, errors = 0;
  for (const s of due) {
    try {
      const view = await swiftDrop().getTracking(s.trackingNumber!);
      await db.$transaction(async (tx) => {
        if (view) {
          const history = [...view.history].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
          for (const h of history) {
            const r = await applyStatus(tx, s.id, { status: h.status, occurredAt: new Date(h.occurredAt), source: "POLL" });
            if (r.moved) moved++;
          }
        }
        await tx.shipment.update({ where: { id: s.id }, data: { lastPolledAt: new Date() } });
      });
      if (!view) console.warn(`[poller] SwiftDrop doesn't know ${s.trackingNumber} (${s.merchantRef})`);
    } catch (e) {
      errors++;
      console.error(`[poller] ${s.merchantRef}: ${(e as Error).message}`);
      await db.shipment.update({ where: { id: s.id }, data: { lastPolledAt: new Date() } }); // don't hammer
    }
  }
  return { checked: due.length, moved, errors };
}
```

`src/app/api/cron/swiftdrop/route.ts`:

```ts
import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { retryDueBookings } from "@/lib/swiftdrop/booking";
import { pollOpenShipments } from "@/lib/swiftdrop/poller";
import { safeEqual } from "@/lib/swiftdrop/signature";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!safeEqual(req.headers.get("authorization") ?? "", `Bearer ${env().CRON_SECRET}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const booking = await retryDueBookings();
  const polling = await pollOpenShipments();
  return NextResponse.json({ booking, polling, at: new Date().toISOString() });
}
```

`scripts/cron-local.ts` (in production use the hosting platform's scheduler instead, calling
the same URL every minute):

```ts
const url = `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"}/api/cron/swiftdrop`;
async function tick() {
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` } });
    console.log(new Date().toISOString(), res.status, await res.text());
  } catch (e) {
    console.error("cron tick failed:", (e as Error).message);
  }
}
tick();
setInterval(tick, 60_000);
```

Run `npm run cron:local` in a second terminal whenever the store is running.

**Check (live):** set `SWIFTDROP_POLL_INTERVAL_SEC=30`. Change a parcel's status in the ERP
(D2). Within about a minute the store's timeline shows it.

## Step 14: Webhook simulator script

Until the ERP sends webhooks, this script **is** the ERP sender. It signs exactly like ADR 0004.
It also works against a store running in live mode, so you can test the receiver at any time.

`scripts/send-webhook.ts`:

```ts
// Usage: npm run webhook:send -- <merchantRef> <STATUS> [FAILURE_REASON] [trackingNumber]
// e.g.   npm run webhook:send -- SLK-10045 PICKED_UP
//        npm run webhook:send -- SLK-10045 FAILED RECIPIENT_UNAVAILABLE
import { createHmac, randomUUID } from "crypto";

const [ref, status, reason, tracking] = process.argv.slice(2);
if (!ref || !status) { console.error("Usage: <merchantRef> <STATUS> [FAILURE_REASON] [trackingNumber]"); process.exit(1); }

const SEQ: Record<string, number> = { CREATED: 1, PICKED_UP: 2, IN_TRANSIT: 3, OUT_FOR_DELIVERY: 4, DELIVERED: 5, FAILED: 5 };
const PREV: Record<string, string | null> = { CREATED: null, PICKED_UP: "CREATED", IN_TRANSIT: "PICKED_UP", OUT_FOR_DELIVERY: "IN_TRANSIT", DELIVERED: "OUT_FOR_DELIVERY", FAILED: "OUT_FOR_DELIVERY" };

const body = JSON.stringify({
  eventId: randomUUID(),
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
const sig = "v1=" + createHmac("sha256", process.env.SWIFTDROP_WEBHOOK_SECRET!).update(`${ts}.${body}`, "utf8").digest("hex");
const eventId = JSON.parse(body).eventId as string;

const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100"}/api/webhooks/swiftdrop`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "X-SwiftDrop-Event-Id": eventId, "X-SwiftDrop-Event-Type": "parcel.status-changed",
             "X-SwiftDrop-Timestamp": ts, "X-SwiftDrop-Signature": sig },
  body,
});
console.log(res.status, await res.text());
```

Also add admin buttons "Simulate next status" / "Simulate failure" (mock mode only) that do the
same thing server-side, like the example's `simulator.ts`, but with this payload format.

**Check:** run `CREATED → PICKED_UP → IN_TRANSIT → OUT_FOR_DELIVERY → DELIVERED` for an order
and watch the timeline fill in. Then send `IN_TRANSIT` again: the shipment stays `DELIVERED`.

## Step 15: Zone sync script

For **live** mode only. The ERP zone list needs a person's login (A3), so this script logs in
as the merchant user. It's run by a developer or admin when zones change, never automatically on
every request.

`scripts/sync-zones.ts`:

```ts
import { PrismaClient } from "@prisma/client";
import { DISTRICTS } from "../src/lib/districts";

const db = new PrismaClient();
const erp = process.env.SWIFTDROP_API_URL ?? "http://localhost:8080";

const login = await fetch(`${erp}/api/v1/auth/tokens`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: process.env.SWIFTDROP_MERCHANT_EMAIL, password: process.env.SWIFTDROP_MERCHANT_PASSWORD }),
});
if (!login.ok) throw new Error(`Login failed: ${login.status}`);
const { accessToken } = (await login.json()) as { accessToken: string };

const res = await fetch(`${erp}/api/v1/zones`, { headers: { Authorization: `Bearer ${accessToken}` } });
if (!res.ok) throw new Error(`Zones failed: ${res.status}`);
const zones = (await res.json()) as { id: string; code: string; name: string }[];

const now = new Date();
for (const z of zones) {
  await db.deliveryZone.upsert({ where: { id: z.id }, create: { ...z, active: true, syncedAt: now }, update: { code: z.code, name: z.name, active: true, syncedAt: now } });
}
// Zones SwiftDrop no longer lists are switched off (checkout will refuse those districts).
await db.deliveryZone.updateMany({ where: { id: { notIn: zones.map((z) => z.id) } }, data: { active: false } });

// Map each district to the zone whose code matches its province (only if not mapped yet).
const byCode = new Map(zones.map((z) => [z.code, z.id]));
for (const [district, code] of Object.entries(DISTRICTS)) {
  const zoneId = byCode.get(code);
  if (zoneId) await db.districtZone.upsert({ where: { district }, create: { district, zoneId }, update: {} });
  else console.warn(`No SwiftDrop zone with code ${code} for ${district}`);
}
console.table(zones);
await db.$disconnect();
```

If the real SwiftDrop zones don't use province codes, map districts by hand in the admin
console (Step 17) instead.

**Check:** `npm run zones:sync` prints the 9 zones, and `DistrictZone` points every district
at a live zone. Then set `STORE_PICKUP_ZONE_ID` to the `WP` id. Also add `DeliveryRate` rows for
the live zones (admin console or seed).

## Step 16: Customer tracking UI

`src/app/api/orders/[orderNumber]/status/route.ts` returns the **current** shipment of an order
the visitor may see (check access exactly like the example's route). It never returns address
or phone:

```ts
type OrderStatusDTO = {
  orderNumber: number;
  shipment: null | {
    attempt: number;
    state: "PENDING_BOOKING" | "BOOKED" | "NEEDS_ATTENTION" | "DELIVERED" | "FAILED";
    trackingNumber: string | null;
    deliveryStatus: string | null;
    failureReason: string | null;
    events: { status: string; failureReason: string | null; occurredAt: string }[];
  };
};
// current shipment = db.shipment.findFirst({ where: { orderId }, orderBy: { attempt: "desc" }, include: { events: true } })
```

Timeline rules for `DeliveryTimeline.tsx`:

- Steps: `CREATED, PICKED_UP, IN_TRANSIT, OUT_FOR_DELIVERY`, then `DELIVERED` or `FAILED`.
- A step is **done** if it has an event **or** a later step has one (polling can miss a step
  that happened between two polls, so we fill gaps visually).
- The current step is the shipment's `deliveryStatus`.
- `PENDING_BOOKING` and `NEEDS_ATTENTION` → badge "Preparing your delivery". Don't show the
  customer technical errors.
- `FAILED` → show `FAILURE_TEXT[failureReason]` plus "We'll contact you about re-delivery."
- Show the tracking number. The order page polls the status route every 10 s until the status
  is final (the example's `LiveOrderStatus` does this already).

**Check:** two browser windows, same order. Simulate statuses; both update within 10 s.

## Step 17: Admin integration console

Admin-only pages (use `requireAdmin()` from the example in every action):

| Page | Shows | Actions |
|---|---|---|
| `/admin` | Counts: pending booking, needs attention, out for delivery, failed today. **Red banner** if any shipment's last error has kind AUTH (key or merchant problem). | |
| `/admin/shipments?state=…` | `merchantRef`, order #, state, delivery status, tracking number, attempts, `lastBookingError`, courier fee vs fee charged, last polled | **Retry booking** (calls `bookShipment`), **Poll now** (polls this one), **Re-ship** (only `FAILED`, Step 18), **Simulate** (mock only) |
| `/admin/webhooks` | Last 200 `WebhookLog` rows: time, result, event type, event ID, error | |
| `/admin/zones` | Zones, active flag, last sync, district → zone mapping, delivery rates | Edit district mapping and rates |

For **needs attention** shipments: the admin fixes the cause first (address, zone mapping,
key), then clicks Retry. `bookShipment` accepts `NEEDS_ATTENTION` shipments.

**Check:** with a wrong `SWIFTDROP_API_KEY`, a new order shows up under needs attention with
`SwiftDrop 401…`, and the banner appears. Fix the key, click Retry, and it's booked.

## Step 18: Re-ship after failure

SwiftDrop never reopens a failed parcel, so a re-ship is a **new shipment** with a new
reference. The old shipment and its timeline stay as history.

```ts
// in app/actions/admin.ts
export async function reship(formData: FormData) {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  const shipmentId = await db.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const last = await tx.shipment.findFirstOrThrow({ where: { orderId }, orderBy: { attempt: "desc" } });
    if (last.state !== "FAILED") throw new Error("Only a failed shipment can be re-shipped");
    const attempt = last.attempt + 1;
    const next = await tx.shipment.create({
      data: {
        orderId, attempt, merchantRef: merchantRefFor(order.orderNumber, attempt),
        dropoffZoneId: last.dropoffZoneId, parcelSize: last.parcelSize,
        weightGrams: last.weightGrams, description: last.description,
      },
    });
    return next.id;
  });
  after(() => bookShipment(shipmentId));
  // finish(…) as in the example
}
```

If the failure was `ADDRESS_NOT_FOUND`, let the admin correct the order address before
re-shipping.

**Check:** fail an order (simulator `FAILED ADDRESS_NOT_FOUND`), re-ship, and you get a new
tracking number under `SLK-<n>-2`. The customer page shows the new timeline.

---

# Part D: Test

## D1. Unit tests (Vitest, no ERP and no database needed)

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "test/empty.ts") } },
});
```

(`test/empty.ts` is an empty file; it lets tests import server-only modules.)

**Signature** (`test/signature.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { signV1, verifyV1 } from "@/lib/swiftdrop/signature";

const secret = "a".repeat(64);
const body = '{"eventId":"x"}';
const now = 1_763_121_662_000;
const ts = String(now / 1000);

describe("verifyV1", () => {
  it("accepts a correct signature", () => {
    expect(verifyV1({ rawBody: body, timestamp: ts, signatureHeader: signV1(secret, ts, body), secret, nowMs: now }).ok).toBe(true);
  });
  it("rejects a wrong secret", () => {
    expect(verifyV1({ rawBody: body, timestamp: ts, signatureHeader: signV1("b".repeat(64), ts, body), secret, nowMs: now }).ok).toBe(false);
  });
  it("rejects a changed body", () => {
    expect(verifyV1({ rawBody: body + " ", timestamp: ts, signatureHeader: signV1(secret, ts, body), secret, nowMs: now }).ok).toBe(false);
  });
  it("rejects an old timestamp (replay)", () => {
    expect(verifyV1({ rawBody: body, timestamp: ts, signatureHeader: signV1(secret, ts, body), secret, nowMs: now + 301_000 }).ok).toBe(false);
  });
  it("rejects the example store's sha256= format", () => {
    const old = signV1(secret, ts, body).replace("v1=", "sha256=");
    expect(verifyV1({ rawBody: body, timestamp: ts, signatureHeader: old, secret, nowMs: now }).ok).toBe(false);
  });
  it("rejects milliseconds timestamps", () => {
    const ms = String(now);
    expect(verifyV1({ rawBody: body, timestamp: ms, signatureHeader: signV1(secret, ms, body), secret, nowMs: now }).ok).toBe(false);
  });
});
```

Add a **fixture test** as soon as the ERP team can give you one real signed request (headers +
raw body + the secret used). It's the only proof that both sides compute HMAC the same way.

**Status rules** (`test/status.test.ts`), one `it` per row:

| current | next | `shouldMoveTo` |
|---|---|---|
| `null` | `CREATED` | true |
| `null` | `IN_TRANSIT` | true (we missed earlier ones) |
| `CREATED` | `PICKED_UP` | true |
| `IN_TRANSIT` | `PICKED_UP` | false (old news) |
| `IN_TRANSIT` | `IN_TRANSIT` | false (repeat) |
| `OUT_FOR_DELIVERY` | `FAILED` | true |
| `DELIVERED` | `FAILED` | false (final) |
| `FAILED` | `OUT_FOR_DELIVERY` | false (no re-attempt in SwiftDrop v1) |

**Other pure functions:** `parcelFor` (1 → SMALL 1400 g, 3 → MEDIUM, 5 → LARGE, 0 and 21 throw),
`normalizeLkPhone` (`0711234567`, `+94 71 123 4567`, `94711234567` → `+94711234567`; `12345` →
null), `kindForStatus` (401/403 → AUTH, 400/409/422 → REJECTED, 408/429/500/503 → RETRYABLE),
schema parsing of the A5 JSON examples (copy them into `test/fixtures/`).

**Database tests** (optional but recommended; run against the compose DB with a separate
`store_test` database): `applyStatus` with events in order 3, 2, 4 → status 4 and three timeline
rows; same status twice → one row; `handleStatusEvent` with the same `eventId` twice → second
returns `duplicate`.

`npm test` must pass before every PR.

## D2. Manual end-to-end test with the real ERP

Prerequisites: B2–B4 done, store `.env` has `SWIFTDROP_MODE=live`, the real key, the WP zone ID
and `SWIFTDROP_POLL_INTERVAL_SEC=30`; `npm run zones:sync` ran; store, `npm run cron:local`
and the ERP are all running.

**1. Place an order** in the store for a Kandy address. Note the order number, e.g. 10001.

**2. Confirm it reached SwiftDrop:**

```powershell
docker compose -f D:\EADproject\SwiftDrop\compose.yaml exec -T postgres psql -U swiftdrop -d swiftdrop -c `
  "SELECT id, tracking_number, status, merchant_order_reference, fee_amount FROM parcels ORDER BY created_at DESC LIMIT 3;"
```

You'll see `SLK-10001`, status `CREATED`, and the same tracking number as the store page.

**3. Assign the courier.** There's no dispatcher API yet, so use SQL (test only):

```powershell
$sql = @"
UPDATE parcels
SET assigned_courier_id = (SELECT id FROM users WHERE email = 'courier@swiftdrop.local'),
    assigned_at = now()
WHERE merchant_order_reference = 'SLK-10001' AND status = 'CREATED';
"@
docker compose -f D:\EADproject\SwiftDrop\compose.yaml exec -T postgres psql -U swiftdrop -d swiftdrop -c $sql
```

**4. Act as the courier:**

```powershell
$erp = "http://localhost:8080"
$c = Invoke-RestMethod -Method Post "$erp/api/v1/auth/tokens" -ContentType "application/json" `
  -Body (@{ email = "courier@swiftdrop.local"; password = "Courier123!" } | ConvertTo-Json)
$C = @{ Authorization = "Bearer $($c.accessToken)" }
$parcelId = "<parcels.id from step 2>"

function Move($to, $reason) {
  $b = @{ toStatus = $to }; if ($reason) { $b.failureReason = $reason }
  Invoke-RestMethod -Method Post "$erp/api/v1/parcels/$parcelId/status-changes" -Headers $C `
    -ContentType "application/json" -Body ($b | ConvertTo-Json)
}

Move "PICKED_UP"            # wait ~1 min → store shows "Picked up"
Move "IN_TRANSIT"
Move "OUT_FOR_DELIVERY"

# DELIVERED needs proof first (multipart form)
curl.exe -s -X PUT "$erp/api/v1/parcels/$parcelId/proof" -H "Authorization: Bearer $($c.accessToken)" -F "recipientName=Kumari Silva"
Move "DELIVERED"
```

After each move, the store timeline catches up within one poll cycle (about 30–60 s).

**5. Failure path:** place another order, repeat steps 2–4 up to `PICKED_UP`, then
`Move "FAILED" "RECIPIENT_UNAVAILABLE"`. The store shows "Delivery unsuccessful". The reason
shows as generic (polling has no reason code) until webhooks exist. Re-ship from the admin
console and check for a new parcel `SLK-<n>-2` in the ERP.

**6. Idempotency:** in the store DB, clear `trackingNumber`/`parcelId` of a booked shipment and
set it back to `PENDING_BOOKING`, then click Retry. The ERP returns `200` with the **same**
`parcelId`; no second row in `parcels`.

**7. ERP down:** stop the ERP backend, place an order. It shows "Preparing your delivery" and
the admin sees attempts and next retry time. Start the ERP; within a few minutes it's booked.

**8. Webhook receiver against live data:**
`npm run webhook:send -- SLK-10001 DELIVERED "" <real tracking number>` → `200` with
`moved: false` (already delivered), and a `PROCESSED` row in `/admin/webhooks`.

## D3. Acceptance checklist

Integration is done when all are ticked:

- [ ] `npm run build`, `npm run lint`, `npm test` pass
- [ ] Order placed while ERP is up → tracking number within seconds
- [ ] Order placed while ERP is down → booked automatically after it comes back
- [ ] Same shipment booked twice → one ERP parcel
- [ ] Invalid address/zone → needs attention, readable error, retry after fix works
- [ ] Wrong API key → needs attention + admin banner
- [ ] Full courier journey shows in the store via polling
- [ ] Signed simulator webhooks: valid → applied; wrong secret → 401; repeat → duplicate;
      older status after newer → no change
- [ ] `FAILED` → re-ship creates `-2` reference and a new parcel
- [ ] Customer pages never show address/phone to non-owners, or technical errors
- [ ] No API key, secret or signature in logs (`grep` the dev server output)
- [ ] District with no zone → checkout refuses before payment

---

# Part E: Operate and troubleshoot

## E1. What happens for each ERP response

| Situation | Shipment state | Retry? | Customer sees | Admin action |
|---|---|---|---|---|
| `201` / `200` | `BOOKED` | — | Tracking number | — |
| Timeout / network / `5xx` / `408` / `429` | `PENDING_BOOKING` | Yes, 1→60 min backoff, 10 attempts | Preparing your delivery | None; watch if it stays |
| 10 retryable failures in a row | `NEEDS_ATTENTION` | No | Preparing your delivery | Check ERP health, click Retry |
| `400` / `409` / `422` | `NEEDS_ATTENTION` | No | Preparing your delivery | Read `lastBookingError`, fix data, Retry |
| `401` | `NEEDS_ATTENTION` + banner | No | Preparing your delivery | Fix `SWIFTDROP_API_KEY`, restart, Retry all |
| `403` | `NEEDS_ATTENTION` + banner | No | Preparing your delivery | Merchant suspended: contact SwiftDrop |
| Tracking `404` while polling | unchanged | Next cycle | unchanged | Investigate if repeated (wrong environment?) |

## E2. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Every booking fails with `400 Invalid request` | Zone ID doesn't exist in the ERP, or no pricing rule for the zone pair | Re-run B3 seed / zone sync; check `STORE_PICKUP_ZONE_ID` |
| `401 Missing X-API-Key header` | Key not set or empty in live mode | Set `SWIFTDROP_API_KEY`, restart `npm run dev` |
| `401 Invalid or revoked API key` | Key copied wrong, revoked, or from another ERP database | Create a new key (B4 step 5) |
| `403` | Merchant not approved yet | B4 step 3 |
| Admin/merchant calls in B4 give `401` | JWT expired (15 min) | Log in again |
| Webhook `401 Invalid signature` | Secret in store `.env` ≠ secret registered in ERP; or the body was re-serialised | Re-register webhook with the same secret; always use `req.text()` |
| Webhook `401 Timestamp outside…` | PC clock wrong, or timestamp in ms | Sync the Windows clock; ERP must send seconds |
| Store never updates in live mode | `cron:local` not running, or shipment not `BOOKED` | Start it; check `lastPolledAt` |
| Order stuck "Preparing" in mock mode | `SWIFTDROP_MOCK_FAIL=true` left on | Turn it off, Retry |
| Port 3000 already in use | ERP frontend is on 3000 | The store runs on 3100 (`-p 3100`) |
| ERP CORS errors in the browser | The browser is calling the ERP directly | Never do that: all ERP calls go through the store server |
| `prisma migrate` can't connect | Store DB container not running / wrong port | `docker compose up -d` in the store repo; port 5433 |

## E3. Security rules

**Do:**
- Keep `SWIFTDROP_API_KEY`, `SWIFTDROP_WEBHOOK_SECRET`, `CRON_SECRET` only in `.env` / the
  hosting secret store.
- Put `import "server-only"` at the top of every `lib/swiftdrop` file that uses `env()`.
- Verify webhook signatures over the raw body, before parsing.
- Check order access on every customer page and status route.
- Rotate the key: create a new key in the ERP → update env → restart → revoke the old key.

**Don't:**
- Log request bodies to SwiftDrop (they contain customer names, phones and addresses), API keys,
  secrets or signatures.
- Call the ERP from the browser.
- Store the API key in the database.
- Return `4xx` from the webhook for "I don't know this order"; return `200` + log (A5.3).
- Trust a fee, status or tracking number sent by the browser.

## E4. When the ERP adds missing features

Ask the ERP merchant-module owner for these. When each lands, only the listed files change:

| ERP change | Store change |
|---|---|
| Webhook sender goes live | Nothing to build. Do the fixture test (D1), raise `SWIFTDROP_POLL_INTERVAL_SEC` to 3600 (polling becomes a safety net). |
| `GET /api/v1/merchant-api/zones` (API key) | `scripts/sync-zones.ts` uses the key instead of logging in; remove `SWIFTDROP_MERCHANT_*`. |
| `POST /api/v1/merchant-api/price-quotes` | Add `quote()` to `client.ts` / `live.ts` / `mock.ts`; checkout shows the real fee, falling back to `DeliveryRate`. |
| `GET /api/v1/merchant-api/orders/{ref}` | `bookShipment` checks it before creating (optional; re-POST already works). |
| Webhook secret generated by the ERP (ADR 0004 §7.4) | Copy the one-time secret into `SWIFTDROP_WEBHOOK_SECRET`. No code change. |
| Event `schemaVersion: 2` | Add a v2 schema in `types.ts` and accept both in the route until v1 is retired. |
| Dispatcher assignment API | D2 step 3 uses it instead of SQL. |

Webhooks to a public deployment must be `https` to a public address (ADR 0004 §7.3). Locally the
ERP must enable its local-development flag to allow `http://localhost:3100`.

## E5. Decisions already made (and why)

These are defaults so nobody is blocked. Change them only with the team lead.

| Decision | Choice | Why |
|---|---|---|
| Customer delivery price | Store's own `DeliveryRate` table | ERP quotes aren't available with the API key; the ERP fee is saved as `courierFee` so margins can be checked |
| Express delivery | Removed | SwiftDrop has no delivery types |
| Max order size | 20 pairs (≈22 kg) | SwiftDrop's limit is 30 kg; splitting into several parcels is out of scope for v1 |
| Main status source today | Polling every 5 min (30 s in tests) | The ERP doesn't send webhooks yet |
| Status ordering | Lifecycle rank, not `sequence` | Equivalent for SwiftDrop's strict forward lifecycle, and works for polled data, which has no sequence |
| Background work | DB rows + cron route, no queue | Simple; enough for one store |
| Re-delivery | New shipment, reference `-<attempt>` | SwiftDrop `FAILED` is final (ADR 0006) |
| Customer notifications on status change | Not in v1 | Can be added later in `applyStatus` callers via an outbox table |
| Live SSE tracking in the browser | Not in v1 | 10 s polling of our own API is enough; SSE can be proxied later |
