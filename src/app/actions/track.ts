"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { grantOrderAccess } from "@/lib/order-access";

export type TrackState = { error?: string; values?: { ref: string; email: string } } | undefined;

const schema = z.object({
  ref: z.string().trim().min(1, { message: "Enter your order number or tracking number" }).max(40),
  email: z.string().trim().toLowerCase().email({ message: "Enter the email you used at checkout" }),
});

export async function trackOrder(_prev: TrackState, formData: FormData): Promise<TrackState> {
  const values = {
    ref: String(formData.get("ref") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  const parsed = schema.safeParse(values);
  if (!parsed.success) return { error: parsed.error.issues[0].message, values };

  const ref = parsed.data.ref.replace(/^#/, "").toUpperCase();
  const asNumber = /^\d{1,9}$/.test(ref) ? Number(ref) : null;

  // Search by orderNumber OR shipment trackingNumber/merchantRef AND match customer email
  const order = await db.order.findFirst({
    where: {
      email: { equals: parsed.data.email, mode: "insensitive" },
      OR: [
        ...(asNumber ? [{ orderNumber: asNumber }] : []),
        { shipments: { some: { trackingNumber: ref } } },
        { shipments: { some: { merchantRef: ref } } },
      ],
    },
    select: { id: true, orderNumber: true },
  });

  if (!order) {
    return {
      error:
        "We couldn't find an order with those details. Please check your order/tracking number and email.",
      values,
    };
  }

  await grantOrderAccess(order.id);
  redirect(`/orders/${order.orderNumber}`);
}

