import { afterEach, describe, expect, it, vi } from "vitest";
import { signRequestV1 } from "@/lib/swiftdrop/signature";
import { LiveSwiftDropClient } from "@/lib/swiftdrop/live";
import { swiftDropZoneCode, DISTRICTS } from "@/lib/districts";

describe("request signing matches SwiftDrop's ApiRequestSignatureTest", () => {
  it("produces the reference signature", () => {
    expect(
      signRequestV1(
        "sig-secret-test-123456",
        "1763200000",
        "POST",
        "/api/v1/merchant-api/orders",
        '{"a":1}',
      ),
    ).toBe("v1=a080e6f603b7f531499fe2f8b22d3999c33e6e64cbf646f56d8bb2a06cca2abd");
  });

  it("changes when the method, path or body changes", () => {
    const base = signRequestV1("s".repeat(20), "1763200000", "POST", "/p", "{}");
    expect(signRequestV1("s".repeat(20), "1763200000", "GET", "/p", "{}")).not.toBe(base);
    expect(signRequestV1("s".repeat(20), "1763200000", "POST", "/q", "{}")).not.toBe(base);
    expect(signRequestV1("s".repeat(20), "1763200000", "POST", "/p", "{ }")).not.toBe(base);
  });
});

describe("LiveSwiftDropClient signing", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubFetch() {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }
  const headersOf = (m: ReturnType<typeof stubFetch>) =>
    (m.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>;

  it("signs the status request exactly as the server will verify it", async () => {
    const fetchMock = stubFetch();
    vi.spyOn(Date, "now").mockReturnValue(1_763_200_000_000);
    const client = new LiveSwiftDropClient("http://x", "sd_live_key", 1000, "sig-secret-test-123456");

    await client.getOrderStatus("SLK-1001-1");

    const h = headersOf(fetchMock);
    expect(h["X-API-Key"]).toBe("sd_live_key");
    expect(h["X-SwiftDrop-Timestamp"]).toBe("1763200000");
    expect(h["X-SwiftDrop-Signature"]).toBe(
      signRequestV1("sig-secret-test-123456", "1763200000", "GET", "/api/v1/merchant-api/orders/SLK-1001-1", ""),
    );
    vi.restoreAllMocks();
  });

  it("sends no signature headers without a signing secret", async () => {
    const fetchMock = stubFetch();
    await new LiveSwiftDropClient("http://x", "sd_live_key", 1000).getOrderStatus("SLK-1");
    const h = headersOf(fetchMock);
    expect(h["X-SwiftDrop-Signature"]).toBeUndefined();
    expect(h["X-SwiftDrop-Timestamp"]).toBeUndefined();
  });

  it("never signs or sends the key on the public tracking call", async () => {
    const fetchMock = stubFetch();
    await new LiveSwiftDropClient("http://x", "sd_live_key", 1000, "sig-secret-test-123456").getTracking("SD7K3M9Q2XWB");
    expect(headersOf(fetchMock)["X-API-Key"]).toBeUndefined();
    expect(headersOf(fetchMock)["X-SwiftDrop-Signature"]).toBeUndefined();
  });
});

describe("zone code mapping to SwiftDrop's seed", () => {
  it("maps the two irregular provinces and prefixes the rest", () => {
    expect(swiftDropZoneCode("UVA")).toBe("LK-UP");
    expect(swiftDropZoneCode("SAB")).toBe("LK-SGP");
    expect(swiftDropZoneCode("WP")).toBe("LK-WP");
    expect(swiftDropZoneCode("NWP")).toBe("LK-NWP");
  });

  it("maps every district to one of SwiftDrop's nine seeded zones", () => {
    const seeded = ["LK-WP", "LK-CP", "LK-SP", "LK-NP", "LK-EP", "LK-NWP", "LK-NCP", "LK-UP", "LK-SGP"];
    for (const code of Object.values(DISTRICTS)) expect(seeded).toContain(swiftDropZoneCode(code));
  });
});
