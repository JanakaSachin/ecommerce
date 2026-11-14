import { describe, expect, it } from "vitest";
import { kindForStatus, SwiftDropError } from "@/lib/swiftdrop/errors";

describe("error classification (kindForStatus)", () => {
  it("classifies 401 and 403 as AUTH", () => {
    expect(kindForStatus(401)).toBe("AUTH");
    expect(kindForStatus(403)).toBe("AUTH");
  });

  it("classifies 5xx, 408, 429 as RETRYABLE", () => {
    expect(kindForStatus(500)).toBe("RETRYABLE");
    expect(kindForStatus(502)).toBe("RETRYABLE");
    expect(kindForStatus(503)).toBe("RETRYABLE");
    expect(kindForStatus(504)).toBe("RETRYABLE");
    expect(kindForStatus(408)).toBe("RETRYABLE");
    expect(kindForStatus(429)).toBe("RETRYABLE");
  });

  it("classifies client 4xx errors as REJECTED", () => {
    expect(kindForStatus(400)).toBe("REJECTED");
    expect(kindForStatus(404)).toBe("REJECTED");
    expect(kindForStatus(409)).toBe("REJECTED");
    expect(kindForStatus(422)).toBe("REJECTED");
  });

  it("constructs SwiftDropError with metadata", () => {
    const err = new SwiftDropError("Invalid key", "AUTH", 401);
    expect(err.message).toBe("Invalid key");
    expect(err.kind).toBe("AUTH");
    expect(err.httpStatus).toBe(401);
    expect(err.name).toBe("SwiftDropError");
  });
});

