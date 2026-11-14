import "server-only";
import { createHash } from "crypto";
import type { SwiftDropClient } from "./client";
import { SwiftDropError } from "./errors";
import type { CreateMerchantOrderRequest, MerchantOrderResponse, PublicTracking } from "./types";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // same Crockford-style Base32 characters SwiftDrop uses

function digest(ref: string) {
  return createHash("sha256").update(ref).digest();
}

/** Deterministic, so a restarted dev server returns the same parcel for the same reference. */
export function fakeParcel(ref: string): MerchantOrderResponse {
  const h = digest(ref);
  const tracking = "SD" + Array.from(h.subarray(0, 10), (b) => ALPHABET[b % 32]).join("");
  const hex = h.toString("hex");
  const parcelId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return {
    parcelId,
    trackingNumber: tracking,
    status: "CREATED",
    feeAmount: "450.00",
    feeCurrency: "LKR",
    createdAt: new Date().toISOString(),
    newlyCreated: true,
  };
}

const g = globalThis as unknown as { __swiftdropMock?: Set<string> };
const seen = (g.__swiftdropMock ??= new Set<string>());

export const mockClient: SwiftDropClient = {
  mode: "mock",
  async createOrder(req: CreateMerchantOrderRequest): Promise<MerchantOrderResponse> {
    if (process.env.SWIFTDROP_MOCK_FAIL === "true") {
      throw new SwiftDropError("Mock: SwiftDrop is down", "RETRYABLE", 503);
    }
    const parcel = fakeParcel(req.merchantOrderReference);
    const replay = seen.has(req.merchantOrderReference);
    seen.add(req.merchantOrderReference);
    return { ...parcel, newlyCreated: !replay };
  },
  async getTracking(): Promise<PublicTracking | null> {
    return null; // in mock mode, status changes come from webhook simulator
  },
};
