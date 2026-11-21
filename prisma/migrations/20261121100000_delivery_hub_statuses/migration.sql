-- SwiftDrop's hub workflow (ADR 0007): every parcel now passes through at least one hub, so status
-- changes include HUB_ARRIVED and HUB_SORTED. Additive; no row is rewritten.
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'HUB_ARRIVED';
ALTER TYPE "DeliveryStatus" ADD VALUE IF NOT EXISTS 'HUB_SORTED';
