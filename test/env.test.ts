import { describe, expect, it, beforeEach } from "vitest";

describe("env configuration validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it("validates when all required variables are present", async () => {
    process.env.SWIFTDROP_MODE = "mock";
    process.env.SWIFTDROP_WEBHOOK_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.STORE_PICKUP_NAME = "ChronoLK Warehouse";
    process.env.STORE_PICKUP_PHONE = "+94110000000";
    process.env.STORE_PICKUP_LINE1 = "12 Warehouse Rd";
    process.env.STORE_PICKUP_CITY = "Colombo 10";
    process.env.STORE_PICKUP_ZONE_ID = "00000000-0000-4000-8000-000000000001";

    const { env } = await import("../src/lib/env");
    const config = env();
    expect(config.SWIFTDROP_MODE).toBe("mock");
    expect(config.STORE_ORDER_REF_PREFIX).toBe("SLK");
  });
});
