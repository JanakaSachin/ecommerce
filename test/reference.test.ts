import { describe, expect, it, beforeEach } from "vitest";

describe("merchantOrderReference generation (merchantRefFor)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STORE_ORDER_REF_PREFIX = "SLK";
    process.env.SWIFTDROP_MODE = "mock";
    process.env.SWIFTDROP_WEBHOOK_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.STORE_PICKUP_NAME = "Warehouse";
    process.env.STORE_PICKUP_PHONE = "+94110000000";
    process.env.STORE_PICKUP_LINE1 = "12 Main St";
    process.env.STORE_PICKUP_CITY = "Colombo 10";
    process.env.STORE_PICKUP_ZONE_ID = "00000000-0000-4000-8000-000000000001";
  });

  it("formats initial attempt as PREFIX-ORDERNUMBER", async () => {
    const { merchantRefFor } = await import("@/lib/swiftdrop/reference");
    expect(merchantRefFor(10045, 1)).toBe("SLK-10045");
    expect(merchantRefFor(1, 1)).toBe("SLK-1");
  });

  it("formats re-ship attempts as PREFIX-ORDERNUMBER-ATTEMPT", async () => {
    const { merchantRefFor } = await import("@/lib/swiftdrop/reference");
    expect(merchantRefFor(10045, 2)).toBe("SLK-10045-2");
    expect(merchantRefFor(10045, 3)).toBe("SLK-10045-3");
  });

  it("throws on invalid order number or attempt", async () => {
    const { merchantRefFor } = await import("@/lib/swiftdrop/reference");
    expect(() => merchantRefFor(0, 1)).toThrow();
    expect(() => merchantRefFor(-5, 1)).toThrow();
    expect(() => merchantRefFor(10045, 0)).toThrow();
  });
});

