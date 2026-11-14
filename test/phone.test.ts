import { describe, expect, it } from "vitest";
import { normalizeLkPhone } from "@/lib/phone";

describe("Sri Lankan phone normalization (normalizeLkPhone)", () => {
  it("normalizes 10-digit leading zero numbers", () => {
    expect(normalizeLkPhone("0711234567")).toBe("+94711234567");
    expect(normalizeLkPhone("0777654321")).toBe("+94777654321");
    expect(normalizeLkPhone("0112345678")).toBe("+94112345678");
  });

  it("normalizes numbers with spaces, hyphens, and parentheses", () => {
    expect(normalizeLkPhone("+94 71 123 4567")).toBe("+94711234567");
    expect(normalizeLkPhone("071-123-4567")).toBe("+94711234567");
    expect(normalizeLkPhone("(071) 1234567")).toBe("+94711234567");
  });

  it("normalizes numbers with country code variants", () => {
    expect(normalizeLkPhone("+94711234567")).toBe("+94711234567");
    expect(normalizeLkPhone("94711234567")).toBe("+94711234567");
    expect(normalizeLkPhone("0094711234567")).toBe("+94711234567");
  });

  it("normalizes 9-digit subscriber numbers without leading zero", () => {
    expect(normalizeLkPhone("711234567")).toBe("+94711234567");
  });

  it("returns null for non-Sri Lankan or malformed inputs", () => {
    expect(normalizeLkPhone("")).toBeNull();
    expect(normalizeLkPhone("12345")).toBeNull(); // too short
    expect(normalizeLkPhone("071123456")).toBeNull(); // 8 subscriber digits
    expect(normalizeLkPhone("07112345678")).toBeNull(); // 10 subscriber digits
    expect(normalizeLkPhone("+14155552671")).toBeNull(); // US number
    expect(normalizeLkPhone("invalid-phone")).toBeNull();
  });
});

