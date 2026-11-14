import type { ParcelSize } from "./types";

const GRAMS_PER_ITEM = 1100; // watch + presentation case + packaging
const PACKAGING_GRAMS = 300;
export const MAX_PAIRS_PER_PARCEL = 20; // 20 * 1100 + 300 = 22.3 kg (SwiftDrop maximum is 30 kg)
export const MAX_ITEMS_PER_PARCEL = MAX_PAIRS_PER_PARCEL;

/**
 * Calculates parcel size and total weight in grams based on item count.
 */
export function parcelFor(items: number): { size: ParcelSize; weightGrams: number } {
  if (!Number.isInteger(items) || items < 1) {
    throw new Error("A parcel needs at least one pair");
  }
  if (items > MAX_PAIRS_PER_PARCEL) {
    throw new Error(`At most ${MAX_PAIRS_PER_PARCEL} pairs per order`);
  }
  const size: ParcelSize = items === 1 ? "SMALL" : items <= 4 ? "MEDIUM" : "LARGE";
  return { size, weightGrams: items * GRAMS_PER_ITEM + PACKAGING_GRAMS };
}

