import "server-only";
import type { DeliveryStatus, EventSource, FailureReason, Prisma } from "@prisma/client";
import { shipmentStateFor, shouldMoveTo } from "./status";

export type StatusNews = {
  status: DeliveryStatus;
  occurredAt: Date;
  source: EventSource;
  failureReason?: FailureReason | null;
  sequence?: number | null;
  eventId?: string | null;
};

/**
 * Records a status for a shipment and moves it forward if the news is newer.
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
    select: { deliveryStatus: true, failureReason: true },
  });

  // 2. Timeline: one row per status. A repeat (webhook + poll for the same status) is skipped.
  await tx.deliveryEvent.createMany({
    data: [
      {
        shipmentId,
        status: news.status,
        failureReason: news.failureReason ?? null,
        sequence: news.sequence ?? null,
        eventId: news.eventId ?? null,
        source: news.source,
        occurredAt: news.occurredAt,
      },
    ],
    skipDuplicates: true,
  });

  // 3. Move forward only.
  const moved = shouldMoveTo(current.deliveryStatus, news.status);
  if (moved) {
    await tx.shipment.update({
      where: { id: shipmentId },
      data: {
        deliveryStatus: news.status,
        state: shipmentStateFor(news.status),
        failureReason: news.status === "FAILED" ? news.failureReason ?? null : null,
      },
    });
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
