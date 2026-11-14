import "server-only";
import { env } from "@/lib/env";

/**
 * Our ID for a SwiftDrop parcel. It is DERIVED, never random, so a retry always sends the same
 * reference and SwiftDrop never creates a duplicate.
 * ⚠️ Never change STORE_ORDER_REF_PREFIX after go-live: old parcels would stop matching.
 */
export function merchantRefFor(orderNumber: number, attempt: number): string {
  if (!Number.isInteger(orderNumber) || orderNumber < 1) {
    throw new Error("Order number must be a positive integer");
  }
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error("Attempt must be a positive integer >= 1");
  }
  const base = `${env().STORE_ORDER_REF_PREFIX}-${orderNumber}`;
  return attempt === 1 ? base : `${base}-${attempt}`;
}

