import type { DeliveryStatus, ShipmentState } from "@prisma/client";

const RANK: Record<DeliveryStatus, number> = {
  CREATED: 1,
  PICKED_UP: 2,
  IN_TRANSIT: 3,
  OUT_FOR_DELIVERY: 4,
  DELIVERED: 9,
  FAILED: 9,
};

export const isTerminal = (s: DeliveryStatus | null | undefined): boolean =>
  s === "DELIVERED" || s === "FAILED";

/**
 * Evaluates whether a shipment currently at `current` may transition to `next`.
 * Invariants:
 * 1. Current null can transition to any initial status.
 * 2. Terminal statuses (DELIVERED, FAILED) can never transition again.
 * 3. Statuses can only advance forward in rank. Older or duplicate events return false.
 */
export function shouldMoveTo(current: DeliveryStatus | null, next: DeliveryStatus): boolean {
  if (current === null) return true;
  if (isTerminal(current)) return false; // final: nothing moves it
  return RANK[next] > RANK[current]; // strictly forward only
}

/**
 * Maps courier DeliveryStatus to store high-level ShipmentState.
 */
export function shipmentStateFor(status: DeliveryStatus): ShipmentState {
  if (status === "DELIVERED") return "DELIVERED";
  if (status === "FAILED") return "FAILED";
  return "BOOKED";
}

export const STATUS_LABELS: Record<DeliveryStatus, string> = {
  CREATED: "Delivery booked with SwiftDrop",
  PICKED_UP: "Picked up from our warehouse",
  IN_TRANSIT: "On the way to your area",
  OUT_FOR_DELIVERY: "Out for delivery. Keep your phone nearby!",
  DELIVERED: "Delivered",
  FAILED: "Delivery unsuccessful",
};

export const FAILURE_TEXT: Record<string, string> = {
  RECIPIENT_UNAVAILABLE: "The courier couldn't reach you at the address.",
  ADDRESS_NOT_FOUND: "The courier couldn't find the address.",
  REFUSED: "The parcel was refused at delivery.",
  DAMAGED: "The parcel was damaged in transit.",
  OTHER: "The delivery couldn't be completed.",
};

