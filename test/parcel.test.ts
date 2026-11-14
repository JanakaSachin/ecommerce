import { describe, expect, it } from "vitest";
import { parcelFor, MAX_PAIRS_PER_PARCEL } from "@/lib/swiftdrop/parcel";

describe("parcel sizing and weight calculation (parcelFor)", () => {
  it("sizes single pair as SMALL with accurate weight", () => {
    const result = parcelFor(1);
    expect(result.size).toBe("SMALL");
    expect(result.weightGrams).toBe(1 * 1100 + 300); // 1400g
  });

  it("sizes 2-4 pairs as MEDIUM", () => {
    const two = parcelFor(2);
    expect(two.size).toBe("MEDIUM");
    expect(two.weightGrams).toBe(2 * 1100 + 300); // 2500g

    const three = parcelFor(3);
    expect(three.size).toBe("MEDIUM");
    expect(three.weightGrams).toBe(3 * 1100 + 300); // 3600g

    const four = parcelFor(4);
    expect(four.size).toBe("MEDIUM");
    expect(four.weightGrams).toBe(4 * 1100 + 300); // 4700g
  });

  it("sizes 5-20 pairs as LARGE", () => {
    const five = parcelFor(5);
    expect(five.size).toBe("LARGE");
    expect(five.weightGrams).toBe(5 * 1100 + 300); // 5800g

    const max = parcelFor(MAX_PAIRS_PER_PARCEL);
    expect(max.size).toBe("LARGE");
    expect(max.weightGrams).toBe(20 * 1100 + 300); // 22300g (<= 30kg)
  });

  it("throws when pair count is less than 1", () => {
    expect(() => parcelFor(0)).toThrow("A parcel needs at least one pair");
    expect(() => parcelFor(-2)).toThrow("A parcel needs at least one pair");
  });

  it("throws when pair count is not an integer", () => {
    expect(() => parcelFor(1.5)).toThrow("A parcel needs at least one pair");
  });

  it("throws when exceeding maximum pairs per parcel (20)", () => {
    expect(() => parcelFor(21)).toThrow(`At most ${MAX_PAIRS_PER_PARCEL} pairs per order`);
    expect(() => parcelFor(100)).toThrow(`At most ${MAX_PAIRS_PER_PARCEL} pairs per order`);
  });
});

