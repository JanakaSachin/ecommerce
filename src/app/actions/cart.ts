"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { findCartId, getOrCreateCartId, MAX_QTY_PER_LINE } from "@/lib/cart";

export type CartActionState = { ok: boolean; message: string } | undefined;

const addSchema = z.object({
  variantId: z.string().min(1, { message: "Please select a size" }),
  quantity: z.coerce.number().int().min(1).max(MAX_QTY_PER_LINE),
});

export async function addToCart(_prev: CartActionState, formData: FormData): Promise<CartActionState> {
  const parsed = addSchema.safeParse({
    variantId: formData.get("variantId"),
    quantity: formData.get("quantity") ?? 1,
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const { variantId, quantity } = parsed.data;

  const variant = await db.productVariant.findUnique({ where: { id: variantId }, include: { product: true } });
  if (!variant) return { ok: false, message: "This product is not available" };

  const cartId = await getOrCreateCartId();
  const existing = await db.cartItem.findUnique({ where: { cartId_variantId: { cartId, variantId } } });
  const newQty = (existing?.quantity ?? 0) + quantity;

  if (variant.stock === 0) return { ok: false, message: "Sorry, this size just sold out" };
  if (newQty > variant.stock) {
    return {
      ok: false,
      message:
        `Only ${variant.stock} left for ${variant.name}` +
        (existing ? ` (you already have ${existing.quantity} in your cart)` : ""),
    };
  }
  if (newQty > MAX_QTY_PER_LINE) return { ok: false, message: `Maximum ${MAX_QTY_PER_LINE} pairs per size` };

  await db.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    update: { quantity: newQty },
    create: { cartId, variantId, quantity },
  });

  revalidatePath("/", "layout"); // refresh the header cart count
  return { ok: true, message: `Added ${variant.product.name} (${variant.name}) to your cart` };
}

export async function updateCartItem(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  const quantity = Number(formData.get("quantity"));
  const cartId = await findCartId();
  if (!cartId || !itemId || !Number.isInteger(quantity)) return;

  // Scoping by cartId makes sure you can only change YOUR cart
  const item = await db.cartItem.findFirst({ where: { id: itemId, cartId }, include: { variant: true } });
  if (!item) return;

  if (quantity <= 0) {
    await db.cartItem.delete({ where: { id: item.id } });
  } else {
    const capped = Math.min(quantity, item.variant.stock, MAX_QTY_PER_LINE);
    if (capped <= 0) await db.cartItem.delete({ where: { id: item.id } });
    else await db.cartItem.update({ where: { id: item.id }, data: { quantity: capped } });
  }
  revalidatePath("/", "layout");
}

export async function removeCartItem(formData: FormData): Promise<void> {
  const itemId = String(formData.get("itemId") ?? "");
  const cartId = await findCartId();
  if (!cartId || !itemId) return;
  await db.cartItem.deleteMany({ where: { id: itemId, cartId } });
  revalidatePath("/", "layout");
}
