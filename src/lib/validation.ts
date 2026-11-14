import { z } from "zod";
import { isDistrict } from "./districts";
import { normalizeLkPhone } from "./phone";

/** Normalized Sri Lankan mobile/landline: always transforms to +94XXXXXXXXX */
export const phoneLK = z.string().transform((v, ctx) => {
  const normalized = normalizeLkPhone(v);
  if (!normalized) {
    ctx.addIssue({
      code: "custom",
      message: "Enter a valid Sri Lankan mobile number (e.g. 0711234567 or +94711234567)",
    });
    return z.NEVER;
  }
  return normalized;
});

const email = z.string().trim().toLowerCase().email({ message: "Enter a valid email" });

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, { message: "Enter your name" }).max(60),
    email,
    phone: phoneLK,
    password: z.string().min(8, { message: "At least 8 characters" }).max(72),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, { message: "Enter your password" }),
});

/** Turns Zod issues into { field: firstMessage } for frontend forms. */
export function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

/** Only allow relative redirects inside our own site (blocks open redirects like "//evil.com"). */
export function safeNext(value: unknown) {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

/**
 * Checkout validation schema conforming to SwiftDrop parcel requirements.
 * Note: deliveryType is removed per ADR 0006 (SwiftDrop has no standard/express tiers).
 */
export const checkoutSchema = z.object({
  customerName: z.string().trim().min(2, { message: "Enter your full name" }).max(200),
  email,
  phone: phoneLK,
  line1: z.string().trim().min(3, { message: "Enter your street address" }).max(200),
  line2: optionalText(200),
  city: z.string().trim().min(2, { message: "Enter your city or town" }).max(100),
  district: z.string().refine(isDistrict, { message: "Select your district" }),
  postalCode: optionalText(10),
  notes: optionalText(300),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;

