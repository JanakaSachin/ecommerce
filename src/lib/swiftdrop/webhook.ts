import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { applyStatus } from "./apply-status";
import type { StatusChangedEvent } from "./types";

type LogInput = {
  rawEventId?: string | null;
  eventType?: string | null;
  signatureValid: boolean;
  result: "REJECTED" | "IGNORED" | "ERROR";
  error?: string | null;
  payload?: unknown;
};

/** Never throws: logging must not break the HTTP response. */
export async function logWebhook(i: LogInput): Promise<void> {
  try {
    await db.webhookLog.create({
      data: {
        rawEventId: i.rawEventId ?? null,
        eventType: i.eventType ?? null,
        signatureValid: i.signatureValid,
        result: i.result,
        error: i.error?.slice(0, 500) ?? null,
        payload: i.payload === undefined ? Prisma.JsonNull : (i.payload as Prisma.InputJsonValue),
      },
    });
  } catch (e) {
    console.error("[webhook] could not write log:", e);
  }
}

export async function handleStatusEvent(
  ev: StatusChangedEvent,
): Promise<{ http: number; body: Record<string, unknown> }> {
  const d = ev.data;

  // 1. Find our shipment: by our reference first (exists even before the booking response was saved).
  const shipment = await db.shipment.findFirst({
    where: {
      OR: [
        ...(d.merchantOrderReference ? [{ merchantRef: d.merchantOrderReference }] : []),
        { trackingNumber: d.trackingNumber },
      ],
    },
    select: { id: true, trackingNumber: true },
  });

  if (!shipment) {
    // Not ours (or an old reference). 200 so SwiftDrop doesn't mark it as a failed delivery.
    await logWebhook({
      rawEventId: ev.eventId,
      eventType: ev.eventType,
      signatureValid: true,
      result: "IGNORED",
      error: "Unknown shipment",
      payload: ev,
    });
    return { http: 200, body: { ok: true, ignored: "unknown shipment" } };
  }

  // 2. Claim the event ID and apply, all-or-nothing.
  try {
    const result = await db.$transaction(async (tx) => {
      await tx.webhookLog.create({
        data: {
          eventId: ev.eventId,
          rawEventId: ev.eventId,
          eventType: ev.eventType,
          signatureValid: true,
          result: "PROCESSED",
          payload: ev as unknown as Prisma.InputJsonValue,
        },
      });

      if (!shipment.trackingNumber) {
        await tx.shipment.update({
          where: { id: shipment.id },
          data: { trackingNumber: d.trackingNumber, parcelId: d.parcelId },
        });
      }

      return applyStatus(tx, shipment.id, {
        status: d.newStatus,
        occurredAt: new Date(ev.occurredAt),
        source: "WEBHOOK",
        failureReason: d.failureReasonCode,
        sequence: d.sequence,
        eventId: ev.eventId,
      });
    });

    return { http: 200, body: { ok: true, moved: result.moved } };
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002" &&
      String(e.meta?.target ?? "").includes("eventId")
    ) {
      return { http: 200, body: { ok: true, duplicate: true } };
    }
    console.error("[webhook] apply failed:", e);
    await logWebhook({
      rawEventId: ev.eventId,
      eventType: ev.eventType,
      signatureValid: true,
      result: "ERROR",
      error: String(e),
    });
    return { http: 500, body: { error: "Internal error" } }; // 5xx -> SwiftDrop retries
  }
}

