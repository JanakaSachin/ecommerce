import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { verifyV1 } from "@/lib/swiftdrop/signature";
import { isKnownStatus, STATUS_CHANGED, statusChangedEventSchema } from "@/lib/swiftdrop/types";
import { handleStatusEvent, logWebhook } from "@/lib/swiftdrop/webhook";

export const runtime = "nodejs"; // needs Node.js crypto
export const dynamic = "force-dynamic";
const MAX_BODY_BYTES = 64 * 1024;

export async function POST(req: Request) {
  const rawBody = await req.text(); // RAW text: the signature covers these exact bytes
  if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Too large" }, { status: 413 });
  }

  const h = (name: string) => req.headers.get(name) ?? "";
  const headerEventId = h("x-swiftdrop-event-id") || null;

  // 1. Signature + timestamp verification, BEFORE parsing anything
  const sig = verifyV1({
    rawBody,
    timestamp: h("x-swiftdrop-timestamp"),
    signatureHeader: h("x-swiftdrop-signature"),
    secret: env().SWIFTDROP_WEBHOOK_SECRET,
  });

  if (!sig.ok) {
    await logWebhook({
      rawEventId: headerEventId,
      eventType: h("x-swiftdrop-event-type") || null,
      signatureValid: false,
      result: "REJECTED",
      error: sig.reason,
    });
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 2. JSON Parsing & schema validation
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    await logWebhook({
      rawEventId: headerEventId,
      signatureValid: true,
      result: "REJECTED",
      error: "Body is not JSON",
    });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // A status the store does not know yet (SwiftDrop added one): acknowledge, so SwiftDrop does not
  // mark the delivery failed, and log it. Polling applies later known statuses by sequence.
  const newStatus = (json as { data?: { newStatus?: unknown } } | null)?.data?.newStatus;
  if (typeof newStatus === "string" && !isKnownStatus(newStatus)) {
    await logWebhook({
      rawEventId: headerEventId,
      eventType: h("x-swiftdrop-event-type") || null,
      signatureValid: true,
      result: "IGNORED",
      error: `Unknown status ${newStatus.slice(0, 40)}`,
      payload: json,
    });
    return NextResponse.json({ ok: true, ignored: "unknown status" });
  }

  const parsed = statusChangedEventSchema.safeParse(json);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    await logWebhook({
      rawEventId: headerEventId,
      signatureValid: true,
      result: "REJECTED",
      error: msg,
      payload: json,
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const ev = parsed.data;
  if (headerEventId && headerEventId !== ev.eventId) {
    await logWebhook({
      rawEventId: headerEventId,
      signatureValid: true,
      result: "REJECTED",
      error: "Header/body eventId mismatch",
    });
    return NextResponse.json({ error: "Event ID mismatch" }, { status: 400 });
  }

  // 3. Filter event type & schema version
  if (ev.eventType !== STATUS_CHANGED || ev.schemaVersion !== 1) {
    await logWebhook({
      rawEventId: ev.eventId,
      eventType: ev.eventType,
      signatureValid: true,
      result: "IGNORED",
      payload: ev,
    });
    return NextResponse.json({ ok: true, ignored: true });
  }

  // 4. Ingest and apply status transactionally
  const r = await handleStatusEvent(ev);
  return NextResponse.json(r.body, { status: r.http });
}

