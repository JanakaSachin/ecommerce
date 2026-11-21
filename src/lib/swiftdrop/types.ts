import { z } from "zod";

export const PARCEL_STATUSES = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "HUB_ARRIVED",
  "HUB_SORTED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "PAUSED",
  "CANCELLED",
] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

/** Whether SwiftDrop's status is one the store knows; SwiftDrop may add statuses later. */
export const isKnownStatus = (s: string): s is ParcelStatus =>
  (PARCEL_STATUSES as readonly string[]).includes(s);

export const FAILURE_REASONS = [
  "RECIPIENT_UNAVAILABLE",
  "ADDRESS_NOT_FOUND",
  "REFUSED",
  "DAMAGED",
  "OTHER",
] as const;
export type FailureReasonCode = (typeof FAILURE_REASONS)[number];

export type ParcelSize = "SMALL" | "MEDIUM" | "LARGE";

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), "not a date");

/** ERP: merchant.web.MerchantOrderAddress */
export type MerchantOrderAddress = {
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  zoneId: string;
  postalCode: string | null;
};

/** ERP: merchant.web.CreateMerchantOrderRequest */
export type CreateMerchantOrderRequest = {
  merchantOrderReference: string;
  /** Omit to use the pickup address registered with the SwiftDrop merchant account. */
  pickup?: MerchantOrderAddress;
  dropoff: MerchantOrderAddress;
  size: ParcelSize;
  weightGrams: number;
  description: string | null;
};

/** ERP: merchant.web.MerchantOrderResponse */
export const merchantOrderResponseSchema = z.object({
  parcelId: z.string().uuid(),
  trackingNumber: z.string().regex(/^SD[0-9A-HJKMNP-TV-Z]{10}$/),
  status: z.enum(PARCEL_STATUSES),
  feeAmount: z.union([z.number(), z.string()]).transform((v) => String(v)),
  feeCurrency: z.string(),
  createdAt: isoDate,
  newlyCreated: z.boolean(),
});
export type MerchantOrderResponse = z.infer<typeof merchantOrderResponseSchema>;

/** ERP: delivery.api.PublicTrackingView */
export const publicTrackingSchema = z.object({
  trackingNumber: z.string(),
  status: z.enum(PARCEL_STATUSES),
  pickupCity: z.string().nullish(),
  dropoffCity: z.string().nullish(),
  history: z.array(z.object({ status: z.enum(PARCEL_STATUSES), occurredAt: isoDate })),
});
export type PublicTracking = z.infer<typeof publicTrackingSchema>;

/** ERP: merchant.web.MerchantOrderStatusResponse (GET /api/v1/merchant-api/orders/{ref}). */
export const merchantOrderStatusSchema = z.object({
  parcelId: z.string().uuid(),
  trackingNumber: z.string(),
  merchantOrderReference: z.string(),
  // Strings, not the enum: a status the store does not know yet must not make the whole order
  // unreadable. Events with an unknown status are dropped; later known events still apply, because
  // the store orders news by sequence, not by status.
  status: z.string(),
  lastSequence: z.number().int().min(0),
  createdAt: isoDate,
  events: z
    .array(
      z.object({
        sequence: z.number().int().min(1),
        eventId: z.string().uuid(),
        status: z.string(),
        previousStatus: z.string().nullable(),
        occurredAt: isoDate,
        failureReasonCode: z.enum(FAILURE_REASONS).nullable(),
      }),
    )
    .transform((events) =>
      events.flatMap((e) => (isKnownStatus(e.status) ? [{ ...e, status: e.status }] : [])),
    ),
});
export type MerchantOrderStatus = z.infer<typeof merchantOrderStatusSchema>;

/** ERP: delivery.api.ParcelStatusChanged (+ ParcelStatusChangedData). Unknown fields are ignored. */
export const statusChangedEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: z.string(),
  schemaVersion: z.number().int(),
  occurredAt: isoDate,
  producer: z.string(),
  data: z.object({
    parcelId: z.string().uuid(),
    trackingNumber: z.string(),
    previousStatus: z.string().nullable(), // informational only; may be a status the store does not know
    newStatus: z.enum(PARCEL_STATUSES),
    sequence: z.number().int().min(1),
    source: z.string(),
    ownerMerchantId: z.string().nullish(),
    merchantOrderReference: z.string().nullable(),
    failureReasonCode: z.enum(FAILURE_REASONS).nullable(),
  }),
});
export type StatusChangedEvent = z.infer<typeof statusChangedEventSchema>;

export const STATUS_CHANGED = "parcel.status-changed";

