"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addToCart, type CartActionState } from "@/app/actions/cart";
import { formatLKR } from "@/lib/money";

type Variant = {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  stock: number;
};

export default function SizePicker({ variants }: { variants: Variant[] }) {
  const [selected, setSelected] = useState<Variant | null>(variants[0] ?? null);
  const [state, action, pending] = useActionState<CartActionState, FormData>(addToCart, undefined);

  return (
    <form action={action} className="mt-6">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-sm text-gray-900">Select Edition & Strap</span>
        {selected && (
          <span className="text-xs font-bold text-accent">
            {selected.price ? formatLKR(selected.price) : ""}
          </span>
        )}
      </div>

      <div className="mt-2.5 space-y-2">
        {variants.map((v) => {
          const soldOut = v.stock === 0;
          const active = selected?.id === v.id;
          return (
            <button
              key={v.id}
              type="button"
              disabled={soldOut}
              onClick={() => setSelected(v)}
              className={`w-full flex items-center justify-between rounded-lg border p-3 text-left transition ${
                active
                  ? "border-accent bg-teal-50/50 ring-1 ring-accent text-gray-900 shadow-sm"
                  : "border-gray-200 bg-white text-gray-700 hover:border-teal-300"
              } ${soldOut ? "cursor-not-allowed opacity-40 bg-gray-50" : ""}`}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                    active ? "border-accent bg-accent" : "border-gray-300"
                  }`}
                >
                  {active && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <span className="text-sm font-medium">{v.name}</span>
              </div>
              <div className="text-right">
                {soldOut ? (
                  <span className="text-xs text-red-600 font-medium">Sold Out</span>
                ) : (
                  <span className="text-xs text-teal-700 font-medium">
                    {v.stock <= 3 ? `Only ${v.stock} left` : "In stock"}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <input type="hidden" name="variantId" value={selected?.id ?? ""} />

      <div className="mt-5 flex items-center gap-3">
        <div className="flex items-center">
          <label htmlFor="qty" className="sr-only">
            Quantity
          </label>
          <input
            id="qty"
            type="number"
            name="quantity"
            min={1}
            max={Math.min(selected?.stock ?? 1, 10)}
            defaultValue={1}
            className="w-20 rounded-md border border-gray-300 px-3 py-3 text-center text-gray-900 font-semibold focus:border-accent outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={!selected || pending}
          className="flex-1 rounded-md bg-accent py-3 font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50 shadow-md"
        >
          {pending ? "Adding to Cart..." : selected ? "Add to Cart" : "Select an Edition"}
        </button>
      </div>

      {state && (
        <div
          className={`mt-4 flex items-center justify-between rounded-md p-3 text-sm ${
            state.ok ? "bg-teal-50 text-teal-800 border border-teal-200" : "bg-red-50 text-red-700 border border-red-200"
          }`}
        >
          <span>
            {state.ok ? "✓ " : ""}
            {state.message}
          </span>
          {state.ok && (
            <Link href="/cart" className="font-semibold underline ml-2 text-brand">
              View cart →
            </Link>
          )}
        </div>
      )}
    </form>
  );
}
