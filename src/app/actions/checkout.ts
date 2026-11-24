"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCart, summarizeCart } from "@/lib/cart";
import { isDistrict } from "@/lib/districts";
import { grantOrderAccess } from "@/lib/order-access";
import { getSession } from "@/lib/session";
import { checkoutSchema, fieldErrors } from "@/lib/validation";
import { bookShipment } from "@/lib/swiftdrop/booking";
import { parcelFor, MAX_PAIRS_PER_PARCEL } from "@/lib/swiftdrop/parcel";
import { merchantRefFor } from "@/lib/swiftdrop/reference";
import { customerDeliveryFee, zoneForDistrict } from "@/lib/swiftdrop/zones";

export type CheckoutState =
  | { errors?: Record<string, string>; values?: Record<string, string> }
  | undefined;

export type DeliveryQuote = {
  fee: number;
  size: string;
  weightKg: number;
  district: string;
  zoneName: string;
} | null;

class OutOfStockError extends Error {
  constructor(productName: string, variantName: string) {
    super(`${productName} (${variantName})`);
    this.name = "OutOfStockError";
  }
}

const FIELDS = [
  "customerName",
  "email",
  "phone",
  "line1",
  "line2",
  "city",
  "district",
  "postalCode",
  "notes",
];

/**
 * Returns dynamic delivery quote from store's zone matrix for the current cart.
 */
export async function getDeliveryQuote(district: string): Promise<DeliveryQuote> {
  if (!isDistrict(district)) return null;
  const cart = await getCart();
  const { itemCount } = summarizeCart(cart);
  if (itemCount === 0 || itemCount > MAX_PAIRS_PER_PARCEL) return null;

  const zone = await zoneForDistrict(district);
  if (!zone) return null;

  const { size, weightGrams } = parcelFor(itemCount);
  const fee = await customerDeliveryFee(zone.id, size);

  return {
    fee,
    size,
    weightKg: weightGrams / 1000,
    district,
    zoneName: zone.name,
  };
}

export async function placeOrder(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const raw = Object.fromEntries(formData) as Record<string, string>;
  const values = Object.fromEntries(FIELDS.map((f) => [f, raw[f] ?? ""]));

  // 1. Validate form input
  const parsed = checkoutSchema.safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };
  const data = parsed.data;

  // 2. Load cart from database
  const cart = await getCart();
  const { items, subtotal, itemCount, hasStockIssue } = summarizeCart(cart);
  if (!cart || items.length === 0) {
    return { errors: { form: "Your cart is empty." }, values };
  }
  if (hasStockIssue) {
    return { errors: { form: "Some items are no longer available. Please review your cart." }, values };
  }
  if (itemCount > MAX_PAIRS_PER_PARCEL) {
    return {
      errors: { form: `We can ship at most ${MAX_PAIRS_PER_PARCEL} watches per order.` },
      values,
    };
  }

  // 3. Resolve delivery zone and customer shipping fee
  const zone = await zoneForDistrict(data.district);
  if (!zone) {
    return { errors: { district: "Sorry, we don't deliver to this district yet." }, values };
  }

  const { size, weightGrams } = parcelFor(itemCount);
  const deliveryFee = await customerDeliveryFee(zone.id, size);
  const session = await getSession();

  // 4. Atomic transaction: Reserve stock, create Order, create Shipment (PENDING_BOOKING), empty cart
  let createdOrder: { id: string; orderNumber: number };
  let shipmentId: string;

  try {
    const txResult = await db.$transaction(
      async (tx) => {
        for (const item of items) {
          const res = await tx.productVariant.updateMany({
            where: { id: item.variantId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (res.count === 0) {
            throw new OutOfStockError(item.variant.product.name, item.variant.name);
          }
        }

        const order = await tx.order.create({
          data: {
            userId: session?.userId ?? null,
            email: data.email,
            customerName: data.customerName,
            phone: data.phone,
            line1: data.line1,
            line2: data.line2 ?? null,
            city: data.city,
            district: data.district,
            postalCode: data.postalCode ?? null,
            notes: data.notes ?? null,
            subtotal,
            deliveryFee,
            total: subtotal + deliveryFee,
            items: {
              create: items.map((i) => ({
                variantId: i.variantId,
                quantity: i.quantity,
                unitPrice: i.variant.price,
                lineTotal: i.variant.price * i.quantity,
              })),
            },
          },
          select: { id: true, orderNumber: true },
        });

        const shipment = await tx.shipment.create({
          data: {
            orderId: order.id,
            attempt: 1,
            merchantRef: merchantRefFor(order.orderNumber, 1),
            dropoffZoneId: zone.id,
            parcelSize: size,
            weightGrams,
            description: `Watches x${itemCount} (order #${order.orderNumber})`,
          },
          select: { id: true },
        });

        await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
        return { order, shipmentId: shipment.id };
      },
      { timeout: 15000, maxWait: 10000 },
    );

    createdOrder = txResult.order;
    shipmentId = txResult.shipmentId;
  } catch (e) {
    if (e instanceof OutOfStockError) {
      return { errors: { form: `Sorry, ${e.message} just sold out. Please update your cart.` }, values };
    }
    throw e;
  }

  // 5. Book with SwiftDrop after the response. Return the promise so the serverless function waits for it.
  after(() => {
    return bookShipment(shipmentId).catch((err) => {
      console.error(`[checkout] Background booking error for shipment ${shipmentId}:`, err);
    });
  });

  // 6. Grant access token and redirect to order tracking page
  await grantOrderAccess(createdOrder.id);
  revalidatePath("/", "layout");
  redirect(`/orders/${createdOrder.orderNumber}`);
}
