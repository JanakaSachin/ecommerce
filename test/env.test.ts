import { describe, expect, it, beforeEach } from "vitest";

describe("env configuration validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    process.env = { ...originalEnv };
    (await import("../src/lib/env")).resetEnvForTests();
  });

  const base = () => {
    process.env.SWIFTDROP_MODE = "mock";
    process.env.SWIFTDROP_WEBHOOK_SECRET = "0123456789abcdef0123456789abcdef";
    process.env.CRON_SECRET = "0123456789abcdef0123456789abcdef";
    for (const name of ["STORE_PICKUP_NAME", "STORE_PICKUP_PHONE", "STORE_PICKUP_LINE1", "STORE_PICKUP_LINE2",
      "STORE_PICKUP_CITY", "STORE_PICKUP_ZONE_ID", "STORE_PICKUP_POSTAL_CODE"]) {
      delete process.env[name];
    }
  };

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

  it("accepts no STORE_PICKUP_* settings at all (SwiftDrop uses the registered pickup address)", async () => {
    base();
    const { env, storePickup } = await import("../src/lib/env");
    expect(storePickup(env())).toBeNull();
  });

  it("refuses a partial pickup address and names the missing settings", async () => {
    base();
    process.env.STORE_PICKUP_NAME = "ChronoLK Warehouse";
    process.env.STORE_PICKUP_CITY = "Galle";
    const { env } = await import("../src/lib/env");
    expect(() => env()).toThrow(/STORE_PICKUP_PHONE/);
    expect(() => env()).toThrow(/STORE_PICKUP_ZONE_ID/);
  });

  it("still checks the phone format when a pickup address is configured", async () => {
    base();
    process.env.STORE_PICKUP_NAME = "ChronoLK Warehouse";
    process.env.STORE_PICKUP_PHONE = "0912234567";
    process.env.STORE_PICKUP_LINE1 = "12 Warehouse Rd";
    process.env.STORE_PICKUP_CITY = "Galle";
    process.env.STORE_PICKUP_ZONE_ID = "00000000-0000-4000-8000-000000000001";
    const { env } = await import("../src/lib/env");
    expect(() => env()).toThrow(/STORE_PICKUP_PHONE/);
  });
});
