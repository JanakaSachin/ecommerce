import { z } from "zod";

export const PARCEL_STATUSES = [
  "CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "FAILED",
  "PAUSED",
  "CANCELLED",
] as const;
export type ParcelStatus = (typeof PARCEL_STATUSES)[number];

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
  pickup: MerchantOrderAddress;
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
    previousStatus: z.enum(PARCEL_STATUSES).nullable(),
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

