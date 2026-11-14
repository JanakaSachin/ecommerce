import Image from "next/image";
import Link from "next/link";
import { getCart, summarizeCart, MAX_QTY_PER_LINE } from "@/lib/cart";
import { formatLKR } from "@/lib/money";
import { removeCartItem, updateCartItem } from "@/app/actions/cart";

export const metadata = { title: "Your Cart – StrideLK" };

export default async function CartPage() {
  const { items, subtotal, itemCount, hasStockIssue } = summarizeCart(await getCart());

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Your cart is empty</h1>
        <p className="mt-2 text-gray-500">Discover your next favourite pair of shoes.</p>
        <Link
          href="/products"
          className="mt-6 inline-block rounded-md bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-dark"
        >
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">Your Cart</h1>

      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="space-y-3 md:col-span-2">
          {items.map((item) => {
            const v = item.variant;
            const p = v.product;
            const tooMany = item.quantity > v.stock;
            const maxQty = Math.min(v.stock, MAX_QTY_PER_LINE);

            return (
              <div
                key={item.id}
                className="flex gap-4 rounded-lg bg-white p-4 shadow-sm"
              >
                <Link
                  href={`/products/${p.slug}`}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md bg-gray-100"
                >
                  <Image
                    src={p.imageUrl || "/hero.jpg"}
                    alt={p.name}
                    fill
                    sizes="96px"
                    className="object-cover"
                  />
                </Link>

                <div className="flex-1">
                  <Link
                    href={`/products/${p.slug}`}
                    className="font-semibold text-gray-900 hover:underline"
                  >
                    {p.name}
                  </Link>
                  <p className="text-sm text-gray-500">{v.name}</p>
                  <p className="mt-1 font-bold text-accent">{formatLKR(v.price)}</p>
                  {tooMany && (
                    <p className="mt-1 text-xs text-red-600 font-semibold">
                      {v.stock === 0
                        ? "This size is now sold out. Please remove it."
                        : `Only ${v.stock} left in stock. Please reduce quantity.`}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end justify-between">
                  <form action={updateCartItem} className="flex items-center rounded-md border border-gray-300">
                    <input type="hidden" name="itemId" value={item.id} />
                    <button
                      name="quantity"
                      value={item.quantity - 1}
                      aria-label="Decrease quantity"
                      className="px-3 py-1 text-gray-600 hover:bg-gray-100"
                    >
                      −
                    </button>
                    <span className="px-3 text-sm font-semibold text-gray-900">
                      {item.quantity}
                    </span>
                    <button
                      name="quantity"
                      value={item.quantity + 1}
                      aria-label="Increase quantity"
                      disabled={item.quantity >= maxQty}
                      className="px-3 py-1 text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                    >
                      +
                    </button>
                  </form>
                  <p className="text-sm font-semibold text-gray-900">
                    {formatLKR(v.price * item.quantity)}
                  </p>
                  <form action={removeCartItem}>
                    <input type="hidden" name="itemId" value={item.id} />
                    <button className="text-xs text-red-600 hover:underline">
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="h-fit rounded-lg bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-gray-900">Order summary</h2>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Total pairs</span>
              <span className="font-medium text-gray-900">{itemCount}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-semibold text-gray-900">{formatLKR(subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-500 text-xs">
              <span>Delivery fee</span>
              <span>Calculated at checkout</span>
            </div>
          </div>

          {hasStockIssue ? (
            <p className="mt-5 rounded-md bg-red-50 p-3 text-center text-sm font-medium text-red-700">
              Please fix items with stock issues to proceed
            </p>
          ) : (
            <Link
              href="/checkout"
              className="mt-5 block rounded-md bg-accent py-3 text-center font-semibold text-white transition hover:bg-accent-dark"
            >
              Proceed to checkout
            </Link>
          )}
          <Link
            href="/products"
            className="mt-2 block text-center text-sm text-gray-500 underline"
          >
            Continue shopping
          </Link>
          <p className="mt-4 text-center text-xs text-gray-400">
            💵 Cash on delivery · 🚚 Island-wide SwiftDrop
          </p>
        </aside>
      </div>
    </div>
  );
}

