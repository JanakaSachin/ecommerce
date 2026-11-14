import "server-only";
import type { SwiftDropClient } from "./client";
import { SwiftDropError, kindForStatus } from "./errors";
import {
  merchantOrderResponseSchema,
  publicTrackingSchema,
  type CreateMerchantOrderRequest,
  type MerchantOrderResponse,
  type PublicTracking,
} from "./types";

export class LiveSwiftDropClient implements SwiftDropClient {
  readonly mode = "live" as const;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeoutMs: number,
  ) {}

  private async send(
    path: string,
    init: { method: string; body?: unknown; withKey?: boolean },
  ): Promise<Response> {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (init.withKey) headers["X-API-Key"] = this.apiKey; // only on /merchant-api/** calls
    try {
      return await fetch(this.baseUrl.replace(/\/+$/, "") + path, {
        method: init.method,
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        signal: AbortSignal.timeout(this.timeoutMs),
        cache: "no-store",
        redirect: "error",
      });
    } catch (e) {
      // timeout, DNS, connection refused …
      throw new SwiftDropError(`SwiftDrop unreachable: ${(e as Error).message}`, "RETRYABLE");
    }
  }

  private async fail(res: Response): Promise<never> {
    const text = await res.text().catch(() => "");
    let detail = res.statusText;
    try {
      const problem = JSON.parse(text) as { detail?: string; title?: string };
      detail = problem.detail ?? problem.title ?? detail;
    } catch {
      /* body was not JSON */
    }
    throw new SwiftDropError(
      `SwiftDrop ${res.status}: ${String(detail).slice(0, 300)}`,
      kindForStatus(res.status),
      res.status,
    );
  }

  async createOrder(req: CreateMerchantOrderRequest): Promise<MerchantOrderResponse> {
    const res = await this.send("/api/v1/merchant-api/orders", {
      method: "POST",
      body: req,
      withKey: true,
    });
    if (res.status !== 200 && res.status !== 201) return this.fail(res);
    const json = await res.json().catch(() => null);
    const parsed = merchantOrderResponseSchema.safeParse(json);
    // Safe to retry: the same reference returns the same parcel.
    if (!parsed.success) {
      throw new SwiftDropError("Unexpected create-order response shape", "RETRYABLE", res.status);
    }
    return parsed.data;
  }

  async getTracking(trackingNumber: string): Promise<PublicTracking | null> {
    const res = await this.send(`/api/v1/tracked-parcels/${encodeURIComponent(trackingNumber)}`, {
      method: "GET",
    });
    if (res.status === 404) return null;
    if (!res.ok) return this.fail(res);
    const json = await res.json().catch(() => null);
    const parsed = publicTrackingSchema.safeParse(json);
    if (!parsed.success) {
      throw new SwiftDropError("Unexpected tracking response shape", "RETRYABLE", res.status);
    }
    return parsed.data;
  }
}

