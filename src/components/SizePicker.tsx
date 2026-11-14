"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { addToCart, type CartActionState } from "@/app/actions/cart";

type Variant = {
  id: string;
  name: string;
  sku?: string;
  price?: number;
  stock: number;
};

export default function SizePicker({ variants }: { variants: Variant[] }) {
  const [selected, setSelected] = useState<Variant | null>(null);
  const [state, action, pending] = useActionState<CartActionState, FormData>(addToCart, undefined);

  return (
    <form action={action} className="mt-6">
      <div className="flex items-center justify-between">
        <span className="font-medium text-gray-900">Select size</span>
        {selected && (
          <span className="text-xs font-semibold text-accent">{selected.name}</span>
        )}
      </div>

      <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-5">
        {variants.map((v) => {
          const soldOut = v.stock === 0;
          const active = selected?.id === v.id;
          return (
            <button
              key={v.id}
              type="button"
              disabled={soldOut}
              onClick={() => setSelected(v)}
              className={`rounded-md border py-2 text-sm font-medium transition ${
                active
                  ? "border-brand bg-brand text-white"
                  : "border-gray-300 bg-white text-gray-800 hover:border-brand"
              } ${soldOut ? "cursor-not-allowed line-through opacity-40" : ""}`}
            >
              {v.name.replace(/^Size\s+/i, "")}
            </button>
          );
        })}
      </div>

      {selected && (
        <p
          className={`mt-2 text-sm ${
            selected.stock <= 3 ? "text-red-600 font-semibold" : "text-green-700"
          }`}
        >
          {selected.stock <= 3 ? `Only ${selected.stock} left in stock!` : "In stock"}
        </p>
      )}

      <input type="hidden" name="variantId" value={selected?.id ?? ""} />

      <div className="mt-4 flex items-center gap-3">
        <input
          type="number"
          name="quantity"
          min={1}
          max={Math.min(selected?.stock ?? 1, 10)}
          defaultValue={1}
          className="w-20 rounded-md border border-gray-300 px-3 py-3 text-center text-gray-900"
        />
        <button
          type="submit"
          disabled={!selected || pending}
          className="flex-1 rounded-md bg-accent py-3 font-semibold text-white transition hover:bg-accent-dark disabled:opacity-50"
        >
          {pending ? "Adding..." : selected ? "Add to cart" : "Select a size"}
        </button>
      </div>

      {state && (
        <div
          className={`mt-3 flex items-center justify-between rounded-md p-3 text-sm ${
            state.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          <span>
            {state.ok ? "✓ " : ""}
            {state.message}
          </span>
          {state.ok && (
            <Link href="/cart" className="font-semibold underline">
              View cart →
            </Link>
          )}
        </div>
      )}
    </form>
  );
}

