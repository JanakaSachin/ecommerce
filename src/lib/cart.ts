import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { getSession } from "./session";
import { secureCookies } from "./cookie-options";

export const CART_COOKIE = "sl_cart";
const CART_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
export const MAX_QTY_PER_LINE = 10;

const cartInclude = {
  items: {
    include: { variant: { include: { product: true } } },
    orderBy: { id: "asc" },
  },
} satisfies Prisma.CartInclude;

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

/** Read-only: finds the current cart id without creating one (safe in pages). */
export async function findCartId(): Promise<string | null> {
  const session = await getSession();
  if (session) {
    const cart = await db.cart.findUnique({ where: { userId: session.userId }, select: { id: true } });
    return cart?.id ?? null;
  }
  const id = (await cookies()).get(CART_COOKIE)?.value;
  if (!id) return null;
  // userId: null -> a guest can never use a logged-in user's cart
  const cart = await db.cart.findFirst({ where: { id, userId: null }, select: { id: true } });
  return cart?.id ?? null;
}

/** Only call from Server Actions: may create a cart and set the cookie. */
export async function getOrCreateCartId(): Promise<string> {
  const session = await getSession();
  if (session) {
    const cart = await db.cart.upsert({
      where: { userId: session.userId },
      update: {},
      create: { userId: session.userId },
    });
    return cart.id;
  }

  const existing = await findCartId();
  if (existing) return existing;

  const cart = await db.cart.create({ data: {} });
  (await cookies()).set(CART_COOKIE, cart.id, {
    httpOnly: true,
    secure: secureCookies,
    sameSite: "lax",
    path: "/",
    maxAge: CART_MAX_AGE,
  });
  return cart.id;
}

export async function getCart(): Promise<CartWithItems | null> {
  const id = await findCartId();
  if (!id) return null;
  return db.cart.findUnique({ where: { id }, include: cartInclude });
}

export async function cartCount(): Promise<number> {
  const id = await findCartId();
  if (!id) return 0;
  const agg = await db.cartItem.aggregate({ where: { cartId: id }, _sum: { quantity: true } });
  return agg._sum.quantity ?? 0;
}

export function summarizeCart(cart: CartWithItems | null) {
  const items = cart?.items ?? [];
  const subtotal = items.reduce((sum, i) => sum + i.variant.product.price * i.quantity, 0);
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const hasStockIssue = items.some((i) => i.quantity > i.variant.stock || !i.variant.product.isActive);
  return { items, subtotal, itemCount, hasStockIssue };
}

/** Called right after login/register: moves the guest cart into the user's cart. */
export async function mergeGuestCart(userId: string): Promise<void> {
  const store = await cookies();
  const guestId = store.get(CART_COOKIE)?.value;
  if (!guestId) return;
  store.delete(CART_COOKIE);

  const guest = await db.cart.findFirst({
    where: { id: guestId, userId: null },
    include: { items: { include: { variant: true } } },
  });
  if (!guest) return;
  if (guest.items.length === 0) {
    await db.cart.delete({ where: { id: guest.id } });
    return;
  }

  const userCart = await db.cart.findUnique({ where: { userId } });

  // User had no cart yet: just hand the guest cart over
  if (!userCart) {
    await db.cart.update({ where: { id: guest.id }, data: { userId } });
    return;
  }

  // Both exist: add quantities together (capped at stock and 10), then delete the guest cart
  const existing = await db.cartItem.findMany({ where: { cartId: userCart.id } });
  const current = new Map(existing.map((i) => [i.variantId, i.quantity]));

  const upserts = guest.items
    .map((item) => ({
      item,
      qty: Math.min((current.get(item.variantId) ?? 0) + item.quantity, item.variant.stock, MAX_QTY_PER_LINE),
    }))
    .filter(({ qty }) => qty > 0)
    .map(({ item, qty }) =>
      db.cartItem.upsert({
        where: { cartId_variantId: { cartId: userCart.id, variantId: item.variantId } },
        update: { quantity: qty },
        create: { cartId: userCart.id, variantId: item.variantId, quantity: qty },
      }),
    );

  await db.$transaction([...upserts, db.cart.delete({ where: { id: guest.id } })]);
}
