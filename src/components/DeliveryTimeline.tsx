import { formatDateTime } from "@/lib/dates";
import { buildTimeline, type OrderStatusDTO } from "@/lib/tracking";

export default function DeliveryTimeline({ data }: { data: OrderStatusDTO }) {
  const steps = buildTimeline(data);

  if (steps.length === 0) {
    return (
      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-800">
        <p className="font-semibold">Preparing your delivery</p>
        <p className="text-xs text-amber-700 mt-1">
          Your order has been received. Our warehouse is preparing the package for courier pickup.
        </p>
      </div>
    );
  }

  return (
    <ol className="mt-6">
      {steps.map((s, k) => {
        const last = k === steps.length - 1;
        const lineDone = !last && steps[k + 1].state !== "upcoming";
        const dot =
          s.state === "failed"
            ? "bg-red-600 text-white"
            : s.state === "held"
              ? "bg-amber-500 text-white"
              : s.state === "cancelled"
                ? "bg-gray-500 text-white"
                : s.state === "upcoming"
                  ? "bg-gray-200 text-gray-400"
                  : "bg-brand text-white";

        return (
          <li key={s.status} className="relative flex gap-4 pb-6 last:pb-0">
            {!last && (
              <span
                className={`absolute left-[11px] top-6 h-full w-0.5 ${
                  lineDone ? "bg-accent" : "bg-gray-200"
                }`}
              />
            )}
            <span
              className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${dot} ${
                s.state === "current" ? "ring-4 ring-teal-200" : ""
              }`}
            >
              {s.state === "failed" || s.state === "cancelled"
                ? "✕"
                : s.state === "held"
                  ? "⏸"
                  : s.state === "upcoming"
                    ? k + 1
                    : "✓"}
            </span>
            <div>
              <p
                className={`font-semibold ${
                  s.state === "upcoming"
                    ? "text-gray-400"
                    : s.state === "failed"
                      ? "text-red-700"
                      : s.state === "held"
                        ? "text-amber-700"
                        : "text-gray-900"
                }`}
              >
                {s.status.replaceAll("_", " ")}
              </p>
              <p className={`text-sm ${s.state === "upcoming" ? "text-gray-400" : "text-gray-600"}`}>
                {s.label}
              </p>
              {s.state === "failed" && (
                <div className="mt-1 rounded bg-red-50 p-2 text-xs text-red-700">
                  <p className="font-medium">{s.failureMessage ?? "Delivery unsuccessful"}</p>
                  <p className="text-gray-600 mt-0.5">We will contact you regarding re-delivery.</p>
                </div>
              )}
              {s.state === "held" && (
                <div className="mt-1 rounded bg-amber-50 p-2 text-xs text-amber-800">
                  <p className="font-medium">Your delivery is on hold.</p>
                  <p className="text-gray-600 mt-0.5">
                    The seller is still preparing your order. Delivery continues as soon as it is ready.
                  </p>
                </div>
              )}
              {s.state === "cancelled" && (
                <div className="mt-1 rounded bg-gray-100 p-2 text-xs text-gray-700">
                  <p className="font-medium">This delivery was cancelled.</p>
                  <p className="text-gray-600 mt-0.5">Please contact the store if you have questions.</p>
                </div>
              )}
              {s.at && s.state !== "upcoming" && (
                <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(s.at)}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

