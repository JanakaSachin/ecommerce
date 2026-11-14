"use client";

import { useEffect, useState } from "react";
import { isFinal, POLL_MS, type OrderStatusDTO } from "@/lib/tracking";
import DeliveryTimeline from "./DeliveryTimeline";
import StatusBadge from "./StatusBadge";

export default function LiveOrderStatus({ initial }: { initial: OrderStatusDTO }) {
  const [data, setData] = useState(initial);
  const [lastChecked, setLastChecked] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const final = isFinal(data);

  useEffect(() => {
    if (final) return; // DELIVERED / FAILED -> stop polling
    let stopped = false;

    const tick = async () => {
      if (document.visibilityState !== "visible") return; // don't poll from hidden background tabs
      try {
        const res = await fetch(`/api/orders/${initial.orderNumber}/status`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as OrderStatusDTO;
        if (!stopped) {
          setData(next);
          setOffline(false);
          setLastChecked(new Date().toLocaleTimeString());
        }
      } catch {
        if (!stopped) setOffline(true);
      }
    };

    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      stopped = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [final, initial.orderNumber]);

  const n = data.orderNumber;
  const shipment = data.shipment;
  const state = shipment?.state;
  const deliveryStatus = shipment?.deliveryStatus;

  const banner =
    !state || state === "PENDING_BOOKING" || state === "NEEDS_ATTENTION"
      ? {
          cls: "border-amber-200 bg-amber-50 text-amber-800",
          text: (
            <>
              ⏳ <b>Order #{n} placed.</b> Preparing your delivery with SwiftDrop. Your tracking
              number will appear here shortly.
            </>
          ),
        }
      : deliveryStatus === "DELIVERED"
        ? {
            cls: "border-green-200 bg-green-50 text-green-800",
            text: (
              <>
                🎉 <b>Order #{n} delivered.</b> Thank you for shopping with StrideLK!
              </>
            ),
          }
        : deliveryStatus === "FAILED"
          ? {
              cls: "border-red-200 bg-red-50 text-red-800",
              text: (
                <>
                  ⚠️ <b>Delivery unsuccessful for order #{n}.</b> We will contact you regarding
                  re-delivery options.
                </>
              ),
            }
          : {
              cls: "border-teal-200 bg-teal-50 text-teal-900",
              text: (
                <>
                  ✅ <b>Order #{n} confirmed.</b> Dispatched with SwiftDrop.
                </>
              ),
            };

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm">
      <div className={`rounded-md border p-3 text-sm ${banner.cls}`}>{banner.text}</div>

      <div className="mt-5 flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm text-gray-500">SwiftDrop Tracking Number</p>
          <p className="font-mono text-xl font-bold text-indigo-700">
            {shipment?.trackingNumber ?? "Assigning..."}
          </p>
        </div>
        <StatusBadge state={state} deliveryStatus={deliveryStatus} />
      </div>

      <DeliveryTimeline data={data} />

      <p className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        {final ? (
          <>Delivery completed (Final status)</>
        ) : offline ? (
          <>
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" /> Reconnecting to status
            feed...
          </>
        ) : (
          <>
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-green-500" />
            Live status · updates every {POLL_MS / 1000}s
            {lastChecked && ` · last checked ${lastChecked}`}
          </>
        )}
      </p>
    </div>
  );
}

