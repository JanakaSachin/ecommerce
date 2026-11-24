"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { bookShipment, retryDueBookings } from "@/lib/swiftdrop/booking";
import { applyOrderStatus } from "@/lib/swiftdrop/apply-status";
import { merchantRefFor } from "@/lib/swiftdrop/reference";
import { handleStatusEvent } from "@/lib/swiftdrop/webhook";
import { isTerminal } from "@/lib/swiftdrop/status";
import { swiftDrop } from "@/lib/swiftdrop/client";
import type { DeliveryStatus, FailureReason } from "@prisma/client";

const isMock = () => (process.env.SWIFTDROP_MODE ?? "mock").toLowerCase() === "mock";

function finish(formData: FormData, ok: boolean, message: string) {
  revalidatePath("/admin", "layout");
  revalidatePath("/orders/[orderNumber]", "page");
  const back = formData.get("returnTo");
  if (typeof back === "string" && back.startsWith("/admin")) {
    const url = new URL(back, "http://localhost");
    url.searchParams.set("notice", message.slice(0, 200));
    url.searchParams.set("tone", ok ? "ok" : "error");
    redirect(url.pathname + url.search);
  }
}

/** Retries booking for a specific shipment (e.g. from NEEDS_ATTENTION or PENDING_BOOKING) */
export async function retryBooking(formData: FormData): Promise<void> {
  await requireAdmin();
  const shipmentId = String(formData.get("shipmentId") ?? "");
  if (!shipmentId) return;

  const res = await bookShipment(shipmentId);
  finish(
    formData,
    res.ok,
    res.ok
      ? `Shipment booked successfully with SwiftDrop (${res.trackingNumber})`
      : `Booking unsuccessful: ${res.message}`,
  );
}

/** Retries all due pending bookings in batch */
export async function retryAllPendingBookings(formData: FormData): Promise<void> {
  await requireAdmin();
  const { due, booked } = await retryDueBookings(20);
  finish(
    formData,
    booked > 0 || due === 0,
    due === 0 ? "No pending bookings due" : `Processed ${due} due bookings: ${booked} booked`,
  );
}

/** Immediately polls status for a single shipment */
export async function pollShipmentNow(formData: FormData): Promise<void> {
  await requireAdmin();
  const shipmentId = String(formData.get("shipmentId") ?? "");
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: { id: true, trackingNumber: true, merchantRef: true },
  });

  if (!shipment?.trackingNumber) {
    return finish(formData, false, "Shipment has no tracking number to poll");
  }

  try {
    const view = await swiftDrop().getOrderStatus(shipment.merchantRef);
    if (!view) {
      return finish(formData, false, `SwiftDrop returned 404 for ${shipment.merchantRef}`);
    }

    let moved = false;
    await db.$transaction(async (tx) => {
      if ((await applyOrderStatus(tx, shipment.id, view, "POLL")) > 0) moved = true;
      await tx.shipment.update({
        where: { id: shipment.id },
        data: { lastPolledAt: new Date() },
      });
    });

    finish(
      formData,
      true,
      `Polled ${shipment.merchantRef}: status is ${view.status}${moved ? " (updated)" : ""}`,
    );
  } catch (e) {
    finish(formData, false, `Poll failed: ${(e as Error).message}`);
  }
}

/** Re-ships an order after a FAILED delivery attempt per ADR 0006 */
export async function reship(formData: FormData): Promise<void> {
  await requireAdmin();
  let orderId = String(formData.get("orderId") ?? "");
  const shipmentId = String(formData.get("shipmentId") ?? "");

  if (!orderId && shipmentId) {
    const s = await db.shipment.findUnique({
      where: { id: shipmentId },
      select: { orderId: true },
    });
    if (s) orderId = s.orderId;
  }

  if (!orderId) return finish(formData, false, "Missing order ID for re-shipment");

  try {
    const { newShipmentId, attempt, merchantRef } = await db.$transaction(async (tx) => {
      const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      const last = await tx.shipment.findFirstOrThrow({
        where: { orderId },
        orderBy: { attempt: "desc" },
      });

      if (last.state !== "FAILED") {
        throw new Error("Only a failed shipment can be re-shipped");
      }

      const nextAttempt = last.attempt + 1;
      const nextRef = merchantRefFor(order.orderNumber, nextAttempt);

      const next = await tx.shipment.create({
        data: {
          orderId,
          attempt: nextAttempt,
          merchantRef: nextRef,
          dropoffZoneId: last.dropoffZoneId,
          parcelSize: last.parcelSize,
          weightGrams: last.weightGrams,
          description: last.description,
        },
      });

      return { newShipmentId: next.id, attempt: nextAttempt, merchantRef: nextRef };
    });

    after(() => {
      return bookShipment(newShipmentId).catch((err) => {
        console.error(`[admin] Background re-shipment error for ${merchantRef}:`, err);
      });
    });

    finish(formData, true, `Created re-shipment attempt #${attempt} (${merchantRef})`);
  } catch (e) {
    finish(formData, false, `Re-ship failed: ${(e as Error).message}`);
  }
}

const NEXT_STATUS: Record<DeliveryStatus, DeliveryStatus | null> = {
  // Same route as SwiftDrop (ADR 0007): every parcel reaches a hub after pickup.
  CREATED: "PICKED_UP",
  PICKED_UP: "HUB_ARRIVED",
  HUB_ARRIVED: "OUT_FOR_DELIVERY",
  HUB_SORTED: "IN_TRANSIT",
  IN_TRANSIT: "HUB_ARRIVED",
  OUT_FOR_DELIVERY: "DELIVERED",
  DELIVERED: null,
  FAILED: null,
  PAUSED: null, // a hold is released by the seller in SwiftDrop, not stepped forward
  CANCELLED: null,
};

/** Simulates the next status step in mock mode via signed webhook pipeline */
export async function simulateNextStatus(formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isMock()) return finish(formData, false, "Simulator operates only in MOCK mode");

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      merchantRef: true,
      trackingNumber: true,
      parcelId: true,
      deliveryStatus: true,
      lastSequence: true,
    },
  });

  if (!shipment?.deliveryStatus) {
    return finish(formData, false, "Shipment has not been booked yet");
  }

  const next = NEXT_STATUS[shipment.deliveryStatus];
  if (!next) {
    return finish(formData, false, `No next status after terminal state ${shipment.deliveryStatus}`);
  }

  const event = {
    eventId: randomUUID(),
    eventType: "parcel.status-changed",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: "delivery",
    data: {
      parcelId: shipment.parcelId ?? randomUUID(),
      trackingNumber: shipment.trackingNumber ?? "SD0000000000",
      previousStatus: shipment.deliveryStatus,
      newStatus: next,
      sequence: shipment.lastSequence + 1,
      source: "MERCHANT",
      ownerCustomerId: null,
      ownerMerchantId: randomUUID(),
      merchantOrderReference: shipment.merchantRef,
      failureReasonCode: null,
    },
  };

  const res = await handleStatusEvent(event);
  finish(
    formData,
    res.http === 200,
    res.http === 200
      ? `Simulated ${shipment.merchantRef} -> ${next}`
      : `Simulation error: ${JSON.stringify(res.body)}`,
  );
}

/** Simulates delivery failure in mock mode */
export async function simulateFailure(formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isMock()) return finish(formData, false, "Simulator operates only in MOCK mode");

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const reason = (String(formData.get("reason") ?? "RECIPIENT_UNAVAILABLE") as FailureReason);

  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      merchantRef: true,
      trackingNumber: true,
      parcelId: true,
      deliveryStatus: true,
      lastSequence: true,
    },
  });

  if (!shipment?.deliveryStatus) {
    return finish(formData, false, "Shipment has not been booked yet");
  }

  if (isTerminal(shipment.deliveryStatus)) {
    return finish(formData, false, `Shipment is already in final status ${shipment.deliveryStatus}`);
  }

  const event = {
    eventId: randomUUID(),
    eventType: "parcel.status-changed",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: "delivery",
    data: {
      parcelId: shipment.parcelId ?? randomUUID(),
      trackingNumber: shipment.trackingNumber ?? "SD0000000000",
      previousStatus: shipment.deliveryStatus,
      newStatus: "FAILED" as const,
      sequence: shipment.lastSequence + 1,
      source: "MERCHANT",
      ownerCustomerId: null,
      ownerMerchantId: randomUUID(),
      merchantOrderReference: shipment.merchantRef,
      failureReasonCode: reason,
    },
  };

  const res = await handleStatusEvent(event);
  finish(
    formData,
    res.http === 200,
    res.http === 200
      ? `Simulated ${shipment.merchantRef} -> FAILED (${reason})`
      : `Simulation error: ${JSON.stringify(res.body)}`,
  );
}

/**
 * Simulates the seller's hold controls in mock mode, as SwiftDrop sends them: HOLD (CREATED to PAUSED),
 * RELEASE (PAUSED back to CREATED) and CANCEL (CREATED or PAUSED to CANCELLED). Only allowed before pickup.
 */
export async function simulateHold(formData: FormData): Promise<void> {
  await requireAdmin();
  if (!isMock()) return finish(formData, false, "Simulator operates only in MOCK mode");

  const shipmentId = String(formData.get("shipmentId") ?? "");
  const kind = String(formData.get("kind") ?? "");
  const shipment = await db.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      merchantRef: true,
      trackingNumber: true,
      parcelId: true,
      deliveryStatus: true,
      lastSequence: true,
    },
  });
  if (!shipment?.deliveryStatus) return finish(formData, false, "Shipment has not been booked yet");

  const current = shipment.deliveryStatus;
  const target: DeliveryStatus | null =
    kind === "HOLD" && current === "CREATED"
      ? "PAUSED"
      : kind === "RELEASE" && current === "PAUSED"
        ? "CREATED"
        : kind === "CANCEL" && (current === "CREATED" || current === "PAUSED")
          ? "CANCELLED"
          : null;
  if (!target) return finish(formData, false, `Cannot ${kind || "change"} a shipment that is ${current}`);

  const res = await handleStatusEvent({
    eventId: randomUUID(),
    eventType: "parcel.status-changed",
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    producer: "delivery",
    data: {
      parcelId: shipment.parcelId ?? randomUUID(),
      trackingNumber: shipment.trackingNumber ?? "SD0000000000",
      previousStatus: current,
      newStatus: target,
      sequence: shipment.lastSequence + 1,
      source: "MERCHANT",
      ownerMerchantId: randomUUID(),
      merchantOrderReference: shipment.merchantRef,
      failureReasonCode: null,
    },
  });
  finish(
    formData,
    res.http === 200,
    res.http === 200
      ? `Simulated ${shipment.merchantRef} -> ${target}`
      : `Simulation error: ${JSON.stringify(res.body)}`,
  );
}

/** Synchronizes delivery zones with SwiftDrop ERP or refreshes store zone catalogue */
export async function syncZonesAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const erp = (process.env.SWIFTDROP_API_URL ?? "http://localhost:8080").replace(/\/+$/, "");
  const email = process.env.SWIFTDROP_MERCHANT_EMAIL;
  const password = process.env.SWIFTDROP_MERCHANT_PASSWORD;

  if (email && password) {
    try {
      const login = await fetch(`${erp}/api/v1/auth/tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (login.ok) {
        const { accessToken } = (await login.json()) as { accessToken: string };
        const res = await fetch(`${erp}/api/v1/zones`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (res.ok) {
          const zones = (await res.json()) as { id: string; code: string; name: string }[];
          const now = new Date();
          for (const z of zones) {
            await db.deliveryZone.upsert({
              where: { id: z.id },
              create: { ...z, active: true, syncedAt: now },
              update: { code: z.code, name: z.name, active: true, syncedAt: now },
            });
          }
          return finish(formData, true, `Successfully synced ${zones.length} zones from SwiftDrop ERP`);
        }
      }
    } catch (e) {
      console.warn("[admin] Live zone sync failed, falling back to database timestamp refresh:", e);
    }
  }

  // Refresh syncedAt for local zones
  await db.deliveryZone.updateMany({
    data: { syncedAt: new Date() },
  });
  finish(formData, true, "Refreshed delivery zones catalogue");
}
