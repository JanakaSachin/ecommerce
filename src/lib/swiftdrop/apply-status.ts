import "server-only";
import type { DeliveryStatus, EventSource, FailureReason, Prisma } from "@prisma/client";
import { shipmentStateFor, shouldMoveTo } from "./status";
import type { PublicTracking } from "./types";

export type StatusNews = {
  status: DeliveryStatus;
  occurredAt: Date;
  source: EventSource;
  failureReason?: FailureReason | null;
  /** SwiftDrop's per-parcel sequence number for this status change (CREATED = 1). */
  sequence: number;
  eventId?: string | null;
};

/**
 * Records a status for a shipment and moves it forward if the news is newer.
 * "Newer" means a higher SwiftDrop sequence, not a later status: a seller can pause a parcel
 * and release it again, so CREATED can legitimately follow PAUSED.
 * MUST be called inside db.$transaction(async (tx) => ...).
 */
export async function applyStatus(
  tx: Prisma.TransactionClient,
  shipmentId: string,
  news: StatusNews,
): Promise<{ moved: boolean }> {
  // 1. Lock the row: a webhook and the poller can't update the same shipment at the same moment.
  await tx.$queryRaw`SELECT id FROM "Shipment" WHERE id = ${shipmentId} FOR UPDATE`;
  const current = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { deliveryStatus: true, failureReason: true, lastSequence: true },
  });

  // 2. Timeline: one row per sequence. A repeat (webhook + poll for the same change) is skipped.
  await tx.deliveryEvent.createMany({
    data: [
      {
        shipmentId,
        status: news.status,
        failureReason: news.failureReason ?? null,
        sequence: news.sequence,
        eventId: news.eventId ?? null,
        source: news.source,
        occurredAt: news.occurredAt,
      },
    ],
    skipDuplicates: true,
  });

  // 3. Move only if this is newer than what we already applied.
  const moved = shouldMoveTo(current.deliveryStatus, current.lastSequence, news.sequence);
  if (moved) {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        deliveryStatus: news.status,
        lastSequence: news.sequence,
        state: shipmentStateFor(news.status),
        failureReason: news.status === "FAILED" ? news.failureReason ?? null : null,
      },
    });

    if (news.status === "CANCELLED") {
      await restockOrder(tx, shipmentId);
    }
  } else if (
    news.status === "FAILED" &&
    current.deliveryStatus === "FAILED" &&
    !current.failureReason &&
    news.failureReason
  ) {
    // Polling saw FAILED first (no reason in the public view); a webhook now tells us why.
    await tx.shipment.update({
      where: { id: shipmentId },
      data: { failureReason: news.failureReason },
    });
    await tx.deliveryEvent.updateMany({
      where: { shipmentId, status: "FAILED" },
      data: { failureReason: news.failureReason },
    });
  }
  return { moved };
}

/**
 * Applies SwiftDrop's public tracking history to a shipment. Every status change adds exactly one
 * history entry, so an entry's position is its sequence number (the first entry, CREATED, is 1).
 * MUST be called inside db.$transaction(async (tx) => ...). Returns how many entries moved it.
 */
export async function applyTrackingHistory(
  tx: Prisma.TransactionClient,
  shipmentId: string,
  view: PublicTracking,
  source: EventSource,
): Promise<number> {
  const history = [...view.history].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  let moved = 0;
  for (const [i, h] of history.entries()) {
    const r = await applyStatus(tx, shipmentId, {
      status: h.status,
      occurredAt: new Date(h.occurredAt),
      source,
      sequence: i + 1,
    });
    if (r.moved) moved++;
  }
  return moved;
}

/**
 * A cancelled delivery means the goods never left the warehouse: put the reserved stock back.
 * Runs once, because CANCELLED is final and `moved` is false for any repeat.
 */
async function restockOrder(tx: Prisma.TransactionClient, shipmentId: string): Promise<void> {
  const shipment = await tx.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { order: { select: { items: { select: { variantId: true, quantity: true } } } } },
  });
  for (const item of shipment.order.items) {
    await tx.productVariant.update({
      where: { id: item.variantId },
      data: { stock: { increment: item.quantity } },
    });
  }
}
