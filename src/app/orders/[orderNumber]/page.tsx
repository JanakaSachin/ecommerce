import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { canViewOrder } from "@/lib/order-access";
import { getSession } from "@/lib/session";
import { formatLKR } from "@/lib/money";
import { formatDateTime } from "@/lib/dates";
import { toStatusDTO, isFinal } from "@/lib/tracking";
import {
  retryBooking,
  reship,
  pollShipmentNow,
  simulateNextStatus,
  simulateFailure,
} from "@/app/actions/admin";
import LiveOrderStatus from "@/components/LiveOrderStatus";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const num = Number((await params).orderNumber);
  if (!Number.isInteger(num) || num <= 0 || num > 2_147_483_647) notFound();

  const order = await db.order.findUnique({
    where: { orderNumber: num },
    include: {
      items: {
        include: {
          variant: { include: { product: true } },
        },
      },
      shipments: {
        orderBy: { attempt: "desc" },
        include: {
          events: { orderBy: { occurredAt: "asc" } },
        },
      },
    },
  });

  if (!order || !(await canViewOrder(order))) notFound();

  const session = await getSession();
  const isAdmin = session?.role === "ADMIN";
  const isMock = (process.env.SWIFTDROP_MODE ?? "mock").toLowerCase() === "mock";
  const latestShipment = order.shipments[0];
  const isTerminalState = latestShipment ? isFinal(latestShipment.deliveryStatus) : false;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b border-gray-200 pb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Order #{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-gray-500">Placed on {formatDateTime(order.createdAt)}</p>
        </div>
        {latestShipment?.attempt && latestShipment.attempt > 1 && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Re-shipment Attempt #{latestShipment.attempt}
          </span>
        )}
      </div>

      {/* Admin Operations Toolbar */}
      {isAdmin && latestShipment && (
        <div className="mt-4 space-y-3">
          {/* Booking Attention / Retry */}
          {(latestShipment.state === "PENDING_BOOKING" || latestShipment.state === "NEEDS_ATTENTION") && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">
                Admin Alert · SwiftDrop Booking Pending / Needs Attention
              </p>
              <p className="mt-1 text-xs">
                Attempts: {latestShipment.bookingAttempts} · Last error:{" "}
                <span className="font-mono">{latestShipment.lastBookingError ?? "None"}</span>
              </p>
              <form action={retryBooking} className="mt-3">
                <input type="hidden" name="shipmentId" value={latestShipment.id} />
                <button
                  type="submit"
                  className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-red-700"
                >
                  Retry Booking Now
                </button>
              </form>
            </div>
          )}

          {/* Re-shipping on FAILED delivery */}
          {latestShipment.state === "FAILED" && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              <p className="font-semibold">Admin Notice · Delivery Failed</p>
              <p className="mt-1 text-xs">
                Failure reason: {latestShipment.failureReason ?? "Unknown"}. You can dispatch a new delivery attempt.
              </p>
              <form action={reship} className="mt-3">
                <input type="hidden" name="shipmentId" value={latestShipment.id} />
                <button
                  type="submit"
                  className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-dark"
                >
                  Create Re-shipment (Attempt #{latestShipment.attempt + 1})
                </button>
              </form>
            </div>
          )}

          {/* Poller / Mock Simulator */}
          {latestShipment.trackingNumber && !isTerminalState && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">
                  Admin Tools · SwiftDrop Live Tracking & Simulation
                </p>
                <form action={pollShipmentNow}>
                  <input type="hidden" name="shipmentId" value={latestShipment.id} />
                  <button
                    type="submit"
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-blue-700"
                  >
                    Poll SwiftDrop Now 🔄
                  </button>
                </form>
              </div>

              {isMock && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-blue-200 pt-3">
                  <form action={simulateNextStatus}>
                    <input type="hidden" name="shipmentId" value={latestShipment.id} />
                    <button
                      type="submit"
                      className="rounded bg-brand px-3 py-1 text-xs font-medium text-white transition hover:bg-brand-dark"
                    >
                      Advance Mock Status ▶
                    </button>
                  </form>
                  <form action={simulateFailure}>
                    <input type="hidden" name="shipmentId" value={latestShipment.id} />
                    <button
                      type="submit"
                      className="rounded border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Simulate Failure ✕
                    </button>
                  </form>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Main Order & Tracking Layout */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <LiveOrderStatus
            key={latestShipment?.updatedAt?.toISOString() ?? order.updatedAt.toISOString()}
            initial={toStatusDTO(order.orderNumber, latestShipment)}
          />
        </div>

        <aside className="h-fit rounded-lg bg-white p-5 text-sm shadow-sm">
          <h2 className="font-semibold text-gray-900">Delivery Address</h2>
          <p className="mt-2 text-gray-700 leading-relaxed">
            <span className="font-medium">{order.customerName}</span>
            <br />
            {order.line1}
            {order.line2 && <>, {order.line2}</>}
            <br />
            {order.city}, {order.district} {order.postalCode}
            <br />
            <span className="font-mono text-xs">{order.phone}</span>
          </p>
          {order.notes && (
            <p className="mt-2 rounded bg-gray-50 p-2 text-xs text-gray-600">
              Note: {order.notes}
            </p>
          )}

          <h2 className="mt-5 border-t border-gray-100 pt-4 font-semibold text-gray-900">
            Order Items
          </h2>
          <div className="mt-2 space-y-2 text-gray-700">
            {order.items.map((i) => (
              <div key={i.id} className="flex justify-between gap-2 text-xs">
                <span>
                  {i.variant.product.name} ({i.variant.name}) × {i.quantity}
                </span>
                <span className="shrink-0 font-medium">{formatLKR(i.lineTotal)}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-3 text-xs">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal</span>
              <span className="font-medium text-gray-900">{formatLKR(order.subtotal)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Delivery Fee</span>
              <span className="font-medium text-gray-900">{formatLKR(order.deliveryFee)}</span>
            </div>
            <div className="flex justify-between border-t border-gray-100 pt-1.5 text-sm font-bold text-gray-900">
              <span>Total (COD)</span>
              <span className="text-accent">{formatLKR(order.total)}</span>
            </div>
          </div>

          <div className="mt-4 rounded bg-gray-50 p-2 text-center text-xs text-gray-500">
            Parcel: {latestShipment?.parcelSize ?? "STANDARD"} · {((latestShipment?.weightGrams ?? 1000) / 1000).toFixed(1)} kg · COD payment
          </div>
        </aside>
      </div>

      <div className="mt-8">
        <Link
          href="/products"
          className="text-sm font-medium text-gray-500 underline hover:text-gray-800"
        >
          ← Continue shopping
        </Link>
      </div>
    </div>
  );
}

