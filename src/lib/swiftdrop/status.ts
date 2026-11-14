import type { DeliveryStatus, ShipmentState } from "@prisma/client";

/** Statuses after which SwiftDrop never reports anything more. */
export const isTerminal = (s: DeliveryStatus | null | undefined): boolean =>
  s === "DELIVERED" || s === "FAILED" || s === "CANCELLED";

/**
 * Evaluates whether news with `nextSequence` should replace a shipment whose latest applied
 * event has `lastSequence` and status `current`.
 *
 * SwiftDrop numbers every status change of a parcel (CREATED = 1) and a seller can hold and
 * release a parcel before pickup (CREATED -> PAUSED -> CREATED), so status order alone cannot tell
 * old news from new news. The sequence can.
 * Invariants:
 * 1. A shipment with no status yet accepts any first news.
 * 2. Terminal statuses (DELIVERED, FAILED, CANCELLED) never change again.
 * 3. Otherwise only a strictly higher sequence wins. Older or duplicate events return false.
 */
export function shouldMoveTo(
  current: DeliveryStatus | null,
  lastSequence: number,
  nextSequence: number,
): boolean {
  if (current === null) return true;
  if (isTerminal(current)) return false;
  return nextSequence > lastSequence;
}

/**
 * Maps courier DeliveryStatus to store high-level ShipmentState.
 */
export function shipmentStateFor(status: DeliveryStatus): ShipmentState {
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "FAILED") return "FAILED";
  if (status === "CANCELLED") return "CANCELLED";
  return "BOOKED"; // includes PAUSED: still open, so it keeps being polled
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  CREATED: "Delivery booked with SwiftDrop",
  PICKED_UP: "Picked up from our warehouse",
  IN_TRANSIT: "On the way to your area",
  OUT_FOR_DELIVERY: "Out for delivery. Keep your phone nearby!",
  DELIVERED: "Delivered",
  FAILED: "Delivery unsuccessful",
  PAUSED: "Delivery is on hold while we prepare your order",
  CANCELLED: "Delivery cancelled",
};

export const FAILURE_TEXT: Record<string, string> = {
  RECIPIENT_UNAVAILABLE: "The courier couldn't reach you at the address.",
  ADDRESS_NOT_FOUND: "The courier couldn't find the address.",
  REFUSED: "The parcel was refused at delivery.",
  DAMAGED: "The parcel was damaged in transit.",
  OTHER: "The delivery couldn't be completed.",
};
