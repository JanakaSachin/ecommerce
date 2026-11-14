-- SwiftDrop can now hold (PAUSED) or cancel (CANCELLED) a parcel before pickup, and a hold can be
-- released, so a status can repeat. The timeline is therefore keyed by SwiftDrop's per-parcel
-- sequence number instead of by status.

-- New statuses
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';
ALTER TYPE "ShipmentState" ADD VALUE IF NOT EXISTS 'CANCELLED';

-- Highest event sequence applied to a shipment
ALTER TABLE "Shipment" ADD COLUMN "lastSequence" INTEGER NOT NULL DEFAULT 0;

-- Existing timelines had one row per status in forward order, so row order by time is the sequence.
WITH numbered AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "shipmentId" ORDER BY "occurredAt", "createdAt") AS n
  FROM "DeliveryEvent"
)
UPDATE "DeliveryEvent" e SET "sequence" = numbered.n FROM numbered WHERE e."id" = numbered."id";

ALTER TABLE "DeliveryEvent" ALTER COLUMN "sequence" SET NOT NULL;

DROP INDEX "DeliveryEvent_shipmentId_status_key";
CREATE UNIQUE INDEX "DeliveryEvent_shipmentId_sequence_key" ON "DeliveryEvent"("shipmentId", "sequence");

UPDATE "Shipment" s
SET "lastSequence" = COALESCE(
  (SELECT MAX(e."sequence") FROM "DeliveryEvent" e WHERE e."shipmentId" = s."id"), 0);
