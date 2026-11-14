import type { ParcelSize } from "./types";

const GRAMS_PER_PAIR = 1100; // shoe + box
const PACKAGING_GRAMS = 300;
export const MAX_PAIRS_PER_PARCEL = 20; // 20 * 1100 + 300 = 22.3 kg (SwiftDrop maximum is 30 kg)

/**
 * Calculates parcel size and total weight in grams based on item count (pairs).
 */
export function parcelFor(pairs: number): { size: ParcelSize; weightGrams: number } {
  if (!Number.isInteger(pairs) || pairs < 1) {
    throw new Error("A parcel needs at least one pair");
  }
  if (pairs > MAX_PAIRS_PER_PARCEL) {
    throw new Error(`At most ${MAX_PAIRS_PER_PARCEL} pairs per order`);
  }
  const size: ParcelSize = pairs === 1 ? "SMALL" : pairs <= 4 ? "MEDIUM" : "LARGE";
  return { size, weightGrams: pairs * GRAMS_PER_PAIR + PACKAGING_GRAMS };
}

