import type { DeliveryEvent, Shipment } from "@prisma/client";
import { FAILURE_TEXT, STATUS_LABELS } from "./swiftdrop/status";

export const POLL_MS = 10_000;

export type OrderStatusDTO = {
  orderNumber: number;
  shipment: null | {
    attempt: number;
    state: "PENDING_BOOKING" | "BOOKED" | "NEEDS_ATTENTION" | "DELIVERED" | "FAILED" | "CANCELLED";
    trackingNumber: string | null;
    deliveryStatus: string | null;
    failureReason: string | null;
    events: { status: string; failureReason: string | null; occurredAt: string }[];
  };
};

export function toStatusDTO(
  orderNumber: number,
  shipment: (Shipment & { events: DeliveryEvent[] }) | null,
): OrderStatusDTO {
  if (!shipment) {
    return { orderNumber, shipment: null };
  }

  return {
    orderNumber,
    shipment: {
      attempt: shipment.attempt,
      state: shipment.state,
      trackingNumber: shipment.trackingNumber,
      deliveryStatus: shipment.deliveryStatus,
      failureReason: shipment.failureReason,
      events: [...shipment.events]
        .sort((a, b) => a.sequence - b.sequence)
        .map((e) => ({
          status: e.status,
          failureReason: e.failureReason,
          occurredAt: e.occurredAt.toISOString(),
        })),
    },
  };
}

export const isFinal = (input: OrderStatusDTO | string | null | undefined): boolean => {
  if (!input) return false;
  if (typeof input === "string") {
    return input === "DELIVERED" || input === "FAILED" || input === "CANCELLED";
  }
  const s = input.shipment?.state;
  return s === "DELIVERED" || s === "FAILED" || s === "CANCELLED";
};

// Main steps in chronological order per ADR 0006 (no ASSIGNED status)
const MAIN_STEPS = ["CREATED", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"] as const;

export type TimelineStep = {
  status: string;
  label: string;
  state: "done" | "current" | "upcoming" | "failed" | "held" | "cancelled";
  at?: string;
  failureReason?: string | null;
  failureMessage?: string;
};

export function buildTimeline(dto: OrderStatusDTO): TimelineStep[] {
  const shipment = dto.shipment;
  if (!shipment || !shipment.deliveryStatus) {
    return [];
  }

  const failed = shipment.deliveryStatus === "FAILED";
  const delivered = shipment.deliveryStatus === "DELIVERED";
  const cancelled = shipment.deliveryStatus === "CANCELLED";
  const paused = shipment.deliveryStatus === "PAUSED";
  // A cancelled delivery ends right after booking; a held one shows the hold before the
  // remaining steps, which come back into play when the seller releases it.
  const steps: string[] = cancelled
    ? ["CREATED", "CANCELLED"]
    : paused
      ? ["CREATED", "PAUSED", ...MAIN_STEPS.slice(1), "DELIVERED"]
      : [...MAIN_STEPS, failed ? "FAILED" : "DELIVERED"];

  const eventMap = new Map<string, OrderStatusDTO["shipment"] extends infer S ? (S extends { events: (infer E)[] } ? E : never) : never>();
  for (const e of shipment.events) {
    // Keep the first booking time, but the latest hold (a delivery can be held more than once).
    if (!eventMap.has(e.status) || e.status === "PAUSED") eventMap.set(e.status, e);
  }

  let reached = -1;
  steps.forEach((s, i) => {
    if (eventMap.has(s) || s === shipment.deliveryStatus) {
      reached = Math.max(reached, i);
    }
  });

  return steps.map((status, i) => {
    const ev = eventMap.get(status);
    let state: TimelineStep["state"];
    if (i < reached) {
      state = failed && !ev ? "upcoming" : "done"; // Gap-filling visual progression
    } else if (i === reached) {
      state = failed
        ? "failed"
        : cancelled
          ? "cancelled"
          : paused
            ? "held"
            : delivered
              ? "done"
              : "current";
    } else {
      state = "upcoming";
    }

    const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
    const failureMessage =
      status === "FAILED" && ev?.failureReason
        ? FAILURE_TEXT[ev.failureReason] ?? "The delivery couldn't be completed."
        : undefined;

    return {
      status,
      label,
      state,
      at: ev?.occurredAt,
      failureReason: ev?.failureReason,
      failureMessage,
    };
  });
}

export function statusBadge(state?: string, deliveryStatus?: string | null) {
  if (!state || state === "PENDING_BOOKING" || state === "NEEDS_ATTENTION") {
    return { label: "Preparing your delivery", cls: "bg-amber-100 text-amber-800" };
  }
  switch (deliveryStatus) {
    case "DELIVERED":
      return { label: "Delivered", cls: "bg-teal-100 text-teal-900 border border-teal-300" };
    case "FAILED":
      return { label: "Delivery unsuccessful", cls: "bg-red-100 text-red-800 border border-red-200" };
    case "OUT_FOR_DELIVERY":
      return { label: "Out for delivery", cls: "bg-emerald-100 text-emerald-900 border border-emerald-300" };
    case "IN_TRANSIT":
      return { label: "In transit", cls: "bg-cyan-100 text-cyan-900 border border-cyan-300" };
    case "PICKED_UP":
      return { label: "Picked up", cls: "bg-teal-50 text-teal-800 border border-teal-200" };
    case "PAUSED":
      return { label: "On hold", cls: "bg-amber-100 text-amber-800 border border-amber-200" };
    case "CANCELLED":
      return { label: "Cancelled", cls: "bg-gray-200 text-gray-700" };
    case "CREATED":
      return { label: "Booked with SwiftDrop", cls: "bg-teal-50 text-teal-900 border border-teal-200" };
    default:
      return { label: "Processing", cls: "bg-gray-100 text-gray-800" };
  }
}

