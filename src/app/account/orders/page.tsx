import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { formatLKR } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import StatusBadge from "@/components/StatusBadge";

export const metadata = { title: "My Orders – ChronoLK" };

export default async function MyOrdersPage() {
  const user = await requireUser("/account/orders");
  const orders = await db.order.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          variant: { include: { product: true } },
        },
      },
      shipments: {
        orderBy: { attempt: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900">My Orders</h1>
      <p className="mt-1 text-sm text-gray-500">
        Hi {user.name}, here are your recent ChronoLK orders.
      </p>

      {orders.length === 0 ? (
        <div className="mt-10 rounded-lg bg-white p-8 text-center shadow-sm">
          <p className="text-gray-500">You haven&apos;t placed any orders yet.</p>
          <Link
            href="/products"
            className="mt-4 inline-block rounded-md bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-dark"
          >
            Start shopping
          </Link>
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => {
            const itemCount = o.items.reduce((sum, item) => sum + item.quantity, 0);
            const latestShipment = o.shipments[0];
            const productNames = o.items
              .map((item) => item.variant.product.name)
              .filter((val, idx, arr) => arr.indexOf(val) === idx)
              .join(", ");

            return (
              <Link
                key={o.id}
                href={`/orders/${o.orderNumber}`}
                className="flex flex-wrap items-center gap-4 rounded-lg bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                <div className="min-w-[110px]">
                  <p className="font-bold text-gray-900">#{o.orderNumber}</p>
                  <p className="text-xs text-gray-500">{formatDate(o.createdAt)}</p>
                </div>
                <div className="flex-1 text-sm text-gray-700">
                  <p className="line-clamp-1 font-medium">{productNames}</p>
                  <p className="text-xs text-gray-500">
                    {itemCount} item{itemCount > 1 ? "s" : ""} · {o.city}, {o.district}
                    {latestShipment?.trackingNumber && (
                      <>
                        {" "}·{" "}
                        <span className="font-mono font-medium text-brand">
                          {latestShipment.trackingNumber}
                        </span>
                      </>
                    )}
                  </p>
                </div>
                <p className="font-semibold text-gray-900">{formatLKR(o.total)}</p>
                <StatusBadge
                  state={latestShipment?.state ?? "PENDING_BOOKING"}
                  deliveryStatus={latestShipment?.deliveryStatus}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

