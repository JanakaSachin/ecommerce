import { describe, expect, it } from "vitest";
import { signV1, verifyV1, safeEqual } from "@/lib/swiftdrop/signature";

const secret = "a".repeat(64);
const body = '{"eventId":"0f4b2c1a-9d8e-4f7a-b6c5-d4e3f2a1b0c9","eventType":"parcel.status-changed"}';
const now = 1_763_121_662_000; // ms
const ts = String(now / 1000); // Unix seconds

describe("signature verification (ADR 0004 v1)", () => {
  it("computes expected v1 signature format", () => {
    const sig = signV1(secret, ts, body);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
  });

  it("accepts a correct signature", () => {
    const sig = signV1(secret, ts, body);
    const result = verifyV1({
      rawBody: body,
      timestamp: ts,
      signatureHeader: sig,
      secret,
      nowMs: now,
    });
    expect(result.ok).toBe(true);
  });

  it("accepts signature from a comma-separated candidate list", () => {
    const sig = signV1(secret, ts, body);
    const result = verifyV1({
      rawBody: body,
      timestamp: ts,
      signatureHeader: `v2=9999, ${sig}, v3=abcd`,
      secret,
      nowMs: now,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when secret differs", () => {
    const wrongSecret = "b".repeat(64);
    const sig = signV1(wrongSecret, ts, body);
    const result = verifyV1({
      rawBody: body,
      timestamp: ts,
      signatureHeader: sig,
      secret,
      nowMs: now,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Invalid signature");
    }
  });

  it("rejects when rawBody is altered (even whitespace)", () => {
    const sig = signV1(secret, ts, body);
    const result = verifyV1({
      rawBody: body + " ",
      timestamp: ts,
      signatureHeader: sig,
      secret,
      nowMs: now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an expired timestamp (> 300s window)", () => {
    const sig = signV1(secret, ts, body);
    const result = verifyV1({
      rawBody: body,
      timestamp: ts,
      signatureHeader: sig,
      secret,
      nowMs: now + 301_000, // 301 seconds later
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("Timestamp outside the 5-minute window");
    }
  });

  it("rejects a timestamp in the far future", () => {
    const sig = signV1(secret, ts, body);
    const result = verifyV1({
      rawBody: body,
      timestamp: ts,
      signatureHeader: sig,
      secret,
      nowMs: now - 301_000,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects legacy sha256= prefix", () => {
    const oldSig = signV1(secret, ts, body).replace("v1=", "sha256=");
    const result = verifyV1({
      rawBody: body,
      timestamp: ts,
      signatureHeader: oldSig,
      secret,
      nowMs: now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects timestamp given in milliseconds", () => {
    const msTs = String(now);
    const sig = signV1(secret, msTs, body);
    const result = verifyV1({
      rawBody: body,
      timestamp: msTs,
      signatureHeader: sig,
      secret,
      nowMs: now,
    });
    expect(result.ok).toBe(false);
  });

  it("rejects when timestamp or signature is missing", () => {
    expect(
      verifyV1({
        rawBody: body,
        timestamp: "",
        signatureHeader: "v1=abc",
        secret,
      }).ok,
    ).toBe(false);

    expect(
      verifyV1({
        rawBody: body,
        timestamp: ts,
        signatureHeader: "",
        secret,
      }).ok,
    ).toBe(false);
  });

  it("safeEqual accurately checks constant-time equality", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "ab")).toBe(false);
  });
});

