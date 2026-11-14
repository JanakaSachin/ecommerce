import "server-only";
import type { Order, Shipment } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { applyStatus } from "./apply-status";
import { swiftDrop } from "./client";
import { SwiftDropError, type FailureKind } from "./errors";
import type { CreateMerchantOrderRequest } from "./types";

const MAX_ATTEMPTS = 10;
const LEASE_MS = 60_000;

/** 1, 2, 4, 8 … minutes, capped at 60, plus up to 30 s of random jitter. */
function backoffMs(attempt: number): number {
  return Math.min(60, 2 ** (attempt - 1)) * 60_000 + Math.floor(Math.random() * 30_000);
}

export function buildCreateRequest(s: Shipment & { order: Order }): CreateMerchantOrderRequest {
  const e = env();
  const o = s.order;
  return {
    merchantOrderReference: s.merchantRef,
    pickup: {
      contactName: e.STORE_PICKUP_NAME,
      phone: e.STORE_PICKUP_PHONE,
      line1: e.STORE_PICKUP_LINE1,
      line2: e.STORE_PICKUP_LINE2,
      city: e.STORE_PICKUP_CITY,
      zoneId: e.STORE_PICKUP_ZONE_ID,
      postalCode: e.STORE_PICKUP_POSTAL_CODE,
    },
    dropoff: {
      contactName: o.customerName,
      phone: o.phone,
      line1: o.line1,
      line2: o.line2 ?? null,
      city: o.city,
      zoneId: s.dropoffZoneId,
      postalCode: o.postalCode ?? null,
    },
    size: s.parcelSize,
    weightGrams: s.weightGrams,
    description: s.description.slice(0, 200),
  };
}

export type BookResult =
  | { ok: true; trackingNumber: string }
  | { ok: false; kind: FailureKind | "SKIPPED"; message: string };

/**
 * Sends one shipment to SwiftDrop. Safe to call any number of times, from anywhere.
 * Never throws for SwiftDrop problems: it records them and schedules a retry.
 */
export async function bookShipment(shipmentId: string): Promise<BookResult> {
  const now = new Date();

  // 1. Claim it, so checkout and cron don't book the same shipment at the same moment.
  const claim = await db.shipment.updateMany({
    where: {
      id: shipmentId,
      trackingNumber: null,
      state: { in: ["PENDING_BOOKING", "NEEDS_ATTENTION"] },
      OR: [{ bookingLeaseUntil: null }, { bookingLeaseUntil: { lt: now } }],
    },
    data: { bookingLeaseUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (claim.count === 0) {
    return { ok: false, kind: "SKIPPED", message: "Already booked or being booked" };
  }

  const s = await db.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    include: { order: true },
  });

  try {
    const res = await swiftDrop().createOrder(buildCreateRequest(s));

    await db.$transaction(async (tx) => {
      await tx.shipment.update({
        where: { id: s.id },
        data: {
          parcelId: res.parcelId,
          trackingNumber: res.trackingNumber,
          courierFee: res.feeAmount,
          bookedAt: new Date(),
          bookingAttempts: { increment: 1 },
          lastBookingError: null,
          nextBookingAt: null,
          bookingLeaseUntil: null,
        },
      });
      // A replay (200) can return a later status, e.g. PICKED_UP.
      await applyStatus(tx, s.id, {
        status: res.status,
        occurredAt: res.status === "CREATED" ? new Date(res.createdAt) : new Date(),
        source: "BOOKING",
      });
    });
    return { ok: true, trackingNumber: res.trackingNumber };
  } catch (e) {
    const err = e instanceof SwiftDropError ? e : new SwiftDropError(String(e), "RETRYABLE");
    const attempts = s.bookingAttempts + 1;
    const giveUp = err.kind !== "RETRYABLE" || attempts >= MAX_ATTEMPTS;
    await db.shipment.update({
      where: { id: s.id },
      data: {
        bookingAttempts: attempts,
        lastBookingError: err.message.slice(0, 500),
        bookingLeaseUntil: null,
        state: giveUp ? "NEEDS_ATTENTION" : "PENDING_BOOKING",
        nextBookingAt: giveUp ? null : new Date(Date.now() + backoffMs(attempts)),
      },
    });
    console.error(
      `[swiftdrop] booking ${s.merchantRef} failed (${err.kind}, attempt ${attempts}): ${err.message}`,
    );
    return { ok: false, kind: err.kind, message: err.message };
  }
}

/** Called by cron: books every shipment whose retry time has come. */
export async function retryDueBookings(limit = 20): Promise<{ due: number; booked: number }> {
  const due = await db.shipment.findMany({
    where: { state: "PENDING_BOOKING", nextBookingAt: { lte: new Date() } },
    orderBy: { nextBookingAt: "asc" },
    take: limit,
    select: { id: true },
  });
  let booked = 0;
  for (const s of due) {
    if ((await bookShipment(s.id)).ok) booked++;
  }
  return { due: due.length, booked };
}

