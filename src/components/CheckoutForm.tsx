"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { getDeliveryQuote, placeOrder, type CheckoutState, type DeliveryQuote } from "@/app/actions/checkout";
import { DISTRICT_LIST, PROVINCES } from "@/lib/districts";
import { formatLKR } from "@/lib/money";
import FormField from "./FormField";

type Item = { id: string; name: string; sizeUk: string; quantity: number; lineTotal: number };
type Props = {
  items: Item[];
  subtotal: number;
  pickupDistrict?: string;
  defaults: { customerName?: string; email?: string; phone?: string };
};

const inputStyle = "rounded-md border px-3 py-2 outline-none focus:border-indigo-600";

export default function CheckoutForm({ items, subtotal, pickupDistrict = "Colombo", defaults }: Props) {
  const [state, action, placing] = useActionState<CheckoutState, FormData>(placeOrder, undefined);
  const v: Record<string, string | undefined> = { ...defaults, ...state?.values };
  const e = state?.errors ?? {};

  const [district, setDistrict] = useState(v.district ?? "");
  const [quote, setQuote] = useState<DeliveryQuote>(null);
  const [quoting, startQuote] = useTransition();

  // Query server for delivery fee whenever customer selects or changes district
  useEffect(() => {
    if (!district) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    startQuote(async () => {
      const q = await getDeliveryQuote(district);
      if (!cancelled) setQuote(q);
    });
    return () => {
      cancelled = true;
    };
  }, [district]);

  return (
    <form action={action} className="mt-6 grid gap-6 md:grid-cols-3">
      <div className="space-y-4 rounded-lg bg-white p-5 shadow-sm md:col-span-2">
        {e.form && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{e.form}</p>}

        <h2 className="text-lg font-semibold text-gray-900">Delivery details</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Full name"
            name="customerName"
            autoComplete="name"
            required
            defaultValue={v.customerName}
            error={e.customerName}
          />
          <FormField
            label="Mobile number (Sri Lanka)"
            name="phone"
            type="tel"
            placeholder="0711234567 or +94711234567"
            autoComplete="tel"
            required
            defaultValue={v.phone}
            error={e.phone}
          />
          <div className="sm:col-span-2">
            <FormField
              label="Email (for order updates and tracking)"
              name="email"
              type="email"
              autoComplete="email"
              required
              defaultValue={v.email}
              error={e.email}
            />
          </div>
          <div className="sm:col-span-2">
            <FormField
              label="Address line 1"
              name="line1"
              placeholder="45 Temple Road"
              autoComplete="address-line1"
              required
              defaultValue={v.line1}
              error={e.line1}
            />
          </div>
          <div className="sm:col-span-2">
            <FormField
              label="Address line 2 (optional)"
              name="line2"
              autoComplete="address-line2"
              defaultValue={v.line2}
              error={e.line2}
            />
          </div>
          <FormField
            label="City / town"
            name="city"
            placeholder="Peradeniya"
            autoComplete="address-level2"
            required
            defaultValue={v.city}
            error={e.city}
          />

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-600">District</span>
            <select
              name="district"
              value={district}
              onChange={(ev) => setDistrict(ev.target.value)}
              required
              className={`${inputStyle} bg-white ${e.district ? "border-red-500" : "border-gray-300"}`}
            >
              <option value="">Select district</option>
              {PROVINCES.map((p) => (
                <optgroup key={p} label={`${p} Province`}>
                  {DISTRICT_LIST.filter((d) => d.province === p).map((d) => (
                    <option key={d.name} value={d.name}>
                      {d.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            {e.district && <span className="text-xs text-red-600">{e.district}</span>}
          </label>

          <FormField
            label="Postal code (optional)"
            name="postalCode"
            placeholder="20000"
            autoComplete="postal-code"
            defaultValue={v.postalCode}
            error={e.postalCode}
          />

          <label className="flex flex-col gap-1 text-sm sm:col-span-2">
            <span className="text-gray-600">Notes for courier (optional)</span>
            <textarea
              name="notes"
              rows={2}
              maxLength={300}
              defaultValue={v.notes}
              placeholder="e.g. Call upon arrival"
              className={`${inputStyle} border-gray-300`}
            />
          </label>
        </div>

        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          💵 Payment Method: <b>Cash on Delivery</b>. Pay the SwiftDrop courier when your shoes arrive.
        </div>

        <button
          disabled={placing || quoting || !quote}
          className="w-full rounded-md bg-indigo-600 py-3 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {placing
            ? "Placing order..."
            : !district
              ? "Select a district to continue"
              : `Place order · ${quote ? formatLKR(subtotal + quote.fee) : "..."}`}
        </button>
      </div>

      <aside className="h-fit rounded-lg bg-white p-5 text-sm shadow-sm">
        <h2 className="font-semibold text-gray-900">Order Summary</h2>
        <div className="mt-3 space-y-2">
          {items.map((i) => (
            <div key={i.id} className="flex justify-between gap-2">
              <span>
                {i.name} · UK {i.sizeUk} × {i.quantity}
              </span>
              <span className="shrink-0">{formatLKR(i.lineTotal)}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2 border-t pt-3">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatLKR(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              Delivery <span className="text-xs text-gray-400">(SwiftDrop)</span>
            </span>
            <span>
              {quoting ? "Calculating..." : quote ? formatLKR(quote.fee) : "Select district"}
            </span>
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold text-gray-900">
            <span>Total</span>
            <span>{quote ? formatLKR(subtotal + quote.fee) : formatLKR(subtotal)}</span>
          </div>
        </div>
        {quote && (
          <p className="mt-3 text-xs text-gray-500">
            Parcel Size: {quote.size} ({quote.weightKg} kg) · {pickupDistrict} → {district}
          </p>
        )}
      </aside>
    </form>
  );
}
