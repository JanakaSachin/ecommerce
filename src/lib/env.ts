import "server-only";
import { z } from "zod";

/** An optional setting: unset or blank becomes undefined. */
const optional = () => z.string().optional().transform((v) => (v?.trim() ? v.trim() : undefined));

/**
 * The pickup (warehouse) address sent with every order. Optional as a group: leave all of them unset to let
 * SwiftDrop use the pickup address registered with the merchant account (the order then carries no pickup).
 * If they are set, SwiftDrop checks that STORE_PICKUP_ZONE_ID is the registered province.
 */
const PICKUP_REQUIRED = [
  "STORE_PICKUP_NAME",
  "STORE_PICKUP_PHONE",
  "STORE_PICKUP_LINE1",
  "STORE_PICKUP_CITY",
  "STORE_PICKUP_ZONE_ID",
] as const;

const schema = z
  .object({
    SWIFTDROP_MODE: z.enum(["mock", "live"]).default("mock"),
    SWIFTDROP_API_URL: z.string().url().default("http://localhost:8080"),
    SWIFTDROP_API_KEY: z.string().default(""),
    // Signs requests to SwiftDrop. Needed once SwiftDrop requires signatures; optional until then.
    SWIFTDROP_SIGNING_SECRET: z.string().default(""),
    SWIFTDROP_WEBHOOK_SECRET: z.string().min(16, "must be at least 16 characters"),
    SWIFTDROP_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
    SWIFTDROP_POLL_INTERVAL_SEC: z.coerce.number().int().min(30).default(300),
    CRON_SECRET: z.string().min(16),
    STORE_ORDER_REF_PREFIX: z.string().regex(/^[A-Z]{2,10}$/).default("SLK"),
    STORE_PICKUP_NAME: optional().pipe(z.string().max(200).optional()),
    STORE_PICKUP_PHONE: optional().pipe(z.string().regex(/^\+94\d{9}$/, "must look like +94XXXXXXXXX").optional()),
    STORE_PICKUP_LINE1: optional().pipe(z.string().max(200).optional()),
    STORE_PICKUP_LINE2: z.string().max(200).optional().transform((v) => v || null),
    STORE_PICKUP_CITY: optional().pipe(z.string().max(100).optional()),
    STORE_PICKUP_POSTAL_CODE: z.string().max(10).optional().transform((v) => v || null),
    STORE_PICKUP_ZONE_ID: optional().pipe(z.string().uuid().optional()),
  })
  .superRefine((e, ctx) => {
    const set = PICKUP_REQUIRED.filter((name) => e[name] !== undefined);
    if (set.length > 0 && set.length < PICKUP_REQUIRED.length) {
      for (const name of PICKUP_REQUIRED.filter((n) => e[n] === undefined)) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: "set all STORE_PICKUP_* values, or none to use the address registered with SwiftDrop",
        });
      }
    }
    if (e.SWIFTDROP_MODE === "live" && !e.SWIFTDROP_API_KEY.startsWith("sd_live_")) {
      ctx.addIssue({ code: "custom", path: ["SWIFTDROP_API_KEY"], message: "live mode needs the sd_live_… key (Part B4)" });
    }
  });

export type Env = z.infer<typeof schema>;

/** The configured pickup address, or null when SwiftDrop should use the merchant's registered one. */
export function storePickup(e: Env) {
  if (!e.STORE_PICKUP_NAME || !e.STORE_PICKUP_PHONE || !e.STORE_PICKUP_LINE1 || !e.STORE_PICKUP_CITY || !e.STORE_PICKUP_ZONE_ID) {
    return null;
  }
  return {
    contactName: e.STORE_PICKUP_NAME,
    phone: e.STORE_PICKUP_PHONE,
    line1: e.STORE_PICKUP_LINE1,
    line2: e.STORE_PICKUP_LINE2,
    city: e.STORE_PICKUP_CITY,
    zoneId: e.STORE_PICKUP_ZONE_ID,
    postalCode: e.STORE_PICKUP_POSTAL_CODE,
  };
}

/** Tests only: forget the parsed configuration so the next env() reads process.env again. */
export function resetEnvForTests(): void {
  cached = undefined;
}
let cached: Env | undefined;

/** Call env() inside functions, not at module top level, so `next build` works without secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
      throw new Error(`Invalid store configuration:\n${msg}`);
    }
    cached = parsed.data;
  }
  return cached;
}
