import "server-only";
import { db } from "@/lib/db";
import type { ParcelSize } from "./types";

/**
 * Returns the active SwiftDrop zone serving a Sri Lankan district,
 * or null if the district is unmapped or the zone is inactive.
 */
export async function zoneForDistrict(district: string) {
  const row = await db.districtZone.findUnique({
    where: { district },
    include: { zone: true },
  });
  return row && row.zone.active ? row.zone : null;
}

/**
 * Returns what the customer pays for delivery from the store's DeliveryRate matrix.
 * Falls back to safe default (700 LKR) if rate row is not configured.
 */
export async function customerDeliveryFee(zoneId: string, size: ParcelSize): Promise<number> {
  const rate = await db.deliveryRate.findUnique({
    where: { zoneId_size: { zoneId, size } },
  });
  return rate?.fee ?? 700;
}

