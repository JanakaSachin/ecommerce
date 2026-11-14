/**
 * RETRYABLE = temporary problem (network, timeout, 5xx, 429), retry with backoff.
 * REJECTED  = client/validation error (400, 409, 422), needs human attention.
 * AUTH      = missing/revoked API key or unapproved merchant (401, 403).
 */
export type FailureKind = "RETRYABLE" | "REJECTED" | "AUTH";

export class SwiftDropError extends Error {
  constructor(
    message: string,
    readonly kind: FailureKind,
    readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "SwiftDropError";
  }
}

export function kindForStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return "AUTH";
  if (status >= 500 || status === 408 || status === 429) return "RETRYABLE";
  return "REJECTED";
}

