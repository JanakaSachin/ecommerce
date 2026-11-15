import "server-only";
import { z } from "zod";

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
    STORE_PICKUP_NAME: z.string().min(1).max(200),
    STORE_PICKUP_PHONE: z.string().regex(/^\+94\d{9}$/, "must look like +94XXXXXXXXX"),
    STORE_PICKUP_LINE1: z.string().min(1).max(200),
    STORE_PICKUP_LINE2: z.string().max(200).optional().transform((v) => v || null),
    STORE_PICKUP_CITY: z.string().min(1).max(100),
    STORE_PICKUP_POSTAL_CODE: z.string().max(10).optional().transform((v) => v || null),
    STORE_PICKUP_ZONE_ID: z.string().uuid(),
  })
  .superRefine((e, ctx) => {
    if (e.SWIFTDROP_MODE === "live" && !e.SWIFTDROP_API_KEY.startsWith("sd_live_")) {
      ctx.addIssue({ code: "custom", path: ["SWIFTDROP_API_KEY"], message: "live mode needs the sd_live_… key (Part B4)" });
    }
  });

export type Env = z.infer<typeof schema>;
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
