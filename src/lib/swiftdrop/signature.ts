import { createHmac, timingSafeEqual } from "crypto";

export const TOLERANCE_SECONDS = 300;

/**
 * Computes signature as "v1=" + hex(HMAC_SHA256(key = secret, message = timestamp + "." + rawBody)).
 * Conforms exactly to ADR 0004 §7.2.
 */
export function signV1(secret: string, timestamp: string, rawBody: string): string {
  return (
    "v1=" +
    createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`, "utf8")
      .digest("hex")
  );
}

/**
 * Constant-time string equality check to prevent timing attacks.
 */
export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Verifies an incoming webhook HMAC signature and timestamp.
 */
export function verifyV1(input: {
  rawBody: string;
  timestamp: string;
  signatureHeader: string;
  secret: string;
  nowMs?: number;
}): { ok: true } | { ok: false; reason: string } {
  const { rawBody, timestamp, signatureHeader, secret, nowMs = Date.now() } = input;
  if (!timestamp || !signatureHeader) {
    return { ok: false, reason: "Missing signature headers" };
  }
  if (!/^\d{9,11}$/.test(timestamp)) {
    return { ok: false, reason: "Timestamp must be Unix seconds" };
  }
  if (Math.abs(nowMs / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) {
    return { ok: false, reason: "Timestamp outside the 5-minute window" };
  }
  const expected = signV1(secret, timestamp, rawBody);
  // Accept comma-separated signatures ("v1=..., v2=...") for forward compatibility
  const candidates = signatureHeader
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("v1="));

  return candidates.some((c) => safeEqual(c, expected))
    ? { ok: true }
    : { ok: false, reason: "Invalid signature" };
}

