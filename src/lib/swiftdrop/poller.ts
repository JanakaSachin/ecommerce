import "server-only";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { applyStatus } from "./apply-status";
import { swiftDrop } from "./client";

/**
 * Polls SwiftDrop for the status of shipments that are currently moving (BOOKED state)
 * and have not been polled within SWIFTDROP_POLL_INTERVAL_SEC.
 */
export async function pollOpenShipments(
  limit = 50,
): Promise<{ checked: number; moved: number; errors: number }> {
  const cutoff = new Date(Date.now() - env().SWIFTDROP_POLL_INTERVAL_SEC * 1000);
  const due = await db.shipment.findMany({
    where: {
      state: "BOOKED",
      trackingNumber: { not: null },
      OR: [{ lastPolledAt: null }, { lastPolledAt: { lt: cutoff } }],
    },
    orderBy: { lastPolledAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { id: true, trackingNumber: true, merchantRef: true },
  });

  let moved = 0;
  let errors = 0;

  for (const s of due) {
    try {
      const view = await swiftDrop().getTracking(s.trackingNumber!);
      await db.$transaction(async (tx) => {
        if (view) {
          const history = [...view.history].sort(
            (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
          );
          for (const h of history) {
            const r = await applyStatus(tx, s.id, {
              status: h.status,
              occurredAt: new Date(h.occurredAt),
              source: "POLL",
            });
            if (r.moved) moved++;
          }
        }
        await tx.shipment.update({ where: { id: s.id }, data: { lastPolledAt: new Date() } });
      });
      if (!view) {
        console.warn(`[poller] SwiftDrop doesn't know ${s.trackingNumber} (${s.merchantRef})`);
      }
    } catch (e) {
      errors++;
      console.error(`[poller] ${s.merchantRef}: ${(e as Error).message}`);
      await db.shipment.update({ where: { id: s.id }, data: { lastPolledAt: new Date() } }); // don't hammer
    }
  }

  return { checked: due.length, moved, errors };
}

