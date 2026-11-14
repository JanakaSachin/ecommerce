import "server-only";
import { env } from "@/lib/env";
import { LiveSwiftDropClient } from "./live";
import { mockClient } from "./mock";
import type { CreateMerchantOrderRequest, MerchantOrderResponse, PublicTracking } from "./types";

export interface SwiftDropClient {
  readonly mode: "mock" | "live";
  /** Resolves on 200/201. Throws SwiftDropError otherwise. */
  createOrder(req: CreateMerchantOrderRequest): Promise<MerchantOrderResponse>;
  /** Returns null when SwiftDrop doesn't know the tracking number (404). */
  getTracking(trackingNumber: string): Promise<PublicTracking | null>;
}

export function swiftDrop(): SwiftDropClient {
  const e = env();
  return e.SWIFTDROP_MODE === "live"
    ? new LiveSwiftDropClient(e.SWIFTDROP_API_URL, e.SWIFTDROP_API_KEY, e.SWIFTDROP_TIMEOUT_MS)
    : mockClient;
}

