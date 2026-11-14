import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { retryAllPendingBookings, retryBooking } from "@/app/actions/admin";
import Notice from "@/components/admin/Notice";
import StatusBadge from "@/components/StatusBadge";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminDashboardPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;

  const [
    shipmentGroups,
    authErrorCount,
    attentionShipments,
    recentWebhookErrors,
    totalOrders,
  ] = await Promise.all([
    db.shipment.groupBy({ by: ["state"], _count: { _all: true } }),
    db.shipment.count({
      where: {
        lastBookingError: {
          contains: "AUTH",
          mode: "insensitive",
        },
      },
    }),
    db.shipment.findMany({
      where: {
        OR: [
          { state: "NEEDS_ATTENTION" },
          { state: "PENDING_BOOKING", bookingAttempts: { gt: 0 } },
        ],
      },
      include: { order: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    db.webhookLog.count({
      where: {
        result: { in: ["REJECTED", "ERROR"] },
      },
    }),
    db.order.count(),
  ]);

  const countState = (s: string) => shipmentGroups.find((g) => g.state === s)?._count._all ?? 0;
  const pending = countState("PENDING_BOOKING");
  const booked = countState("BOOKED");
  const needsAttention = countState("NEEDS_ATTENTION");
  const delivered = countState("DELIVERED");
  const failed = countState("FAILED");
  const totalShipments = shipmentGroups.reduce((acc, g) => acc + g._count._all, 0);

  return (
    <div className="space-y-6">
      <Notice notice={one(sp.notice)} tone={one(sp.tone)} />

      {/* Critical AUTH Error Banner */}
      {authErrorCount > 0 && (
        <div className="rounded-lg border-2 border-red-500 bg-red-50 p-5 text-red-900 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">🚨</span>
            <div className="flex-1">
              <h3 className="font-bold text-red-800">
                CRITICAL: SwiftDrop Authentication Failure Detected ({authErrorCount} shipment(s))
              </h3>
              <p className="mt-1 text-sm text-red-700">
                The store is unable to authenticate with the SwiftDrop ERP API. Please verify that{" "}
                <code className="font-mono bg-red-100 px-1 py-0.5 rounded">SWIFTDROP_API_KEY</code>{" "}
                in your environment is valid and active in SwiftDrop ERP.
              </p>
              <div className="mt-3 flex gap-3">
                <Link
                  href="/admin/shipments?state=NEEDS_ATTENTION"
                  className="rounded bg-red-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-800"
                >
                  View Affected Shipments →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs uppercase font-semibold text-gray-500">Total Orders</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{totalOrders}</p>
          <p className="text-xs text-gray-400 mt-1">{totalShipments} total attempts</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs uppercase font-semibold text-gray-500">Pending Booking</p>
          <p className="mt-2 text-2xl font-bold text-amber-600">{pending}</p>
          <p className="text-xs text-gray-400 mt-1">Awaiting dispatch</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs uppercase font-semibold text-gray-500">Needs Attention</p>
          <p className="mt-2 text-2xl font-bold text-red-600">{needsAttention}</p>
          <p className="text-xs text-gray-400 mt-1">Exceeded retries / Auth</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs uppercase font-semibold text-gray-500">In Courier Transit</p>
          <p className="mt-2 text-2xl font-bold text-blue-600">{booked}</p>
          <p className="text-xs text-gray-400 mt-1">Active tracking</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs uppercase font-semibold text-gray-500">Delivered</p>
          <p className="mt-2 text-2xl font-bold text-green-600">{delivered}</p>
          <p className="text-xs text-gray-400 mt-1">Completed orders</p>
        </div>
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <p className="text-xs uppercase font-semibold text-gray-500">Delivery Failed</p>
          <p className="mt-2 text-2xl font-bold text-gray-700">{failed}</p>
          <p className="text-xs text-gray-400 mt-1">Eligible for re-ship</p>
        </div>
      </div>

      {/* Quick Action Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-4 shadow-sm border border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900">SwiftDrop Background Operations</h2>
          <p className="text-xs text-gray-500">
            Trigger automatic retries for all pending or retryable shipments now.
          </p>
        </div>
        <form action={retryAllPendingBookings}>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
          >
            Retry All Due Bookings ↻
          </button>
        </form>
      </div>

      {/* Attention Required Shipments Table */}
      <div className="rounded-lg bg-white p-5 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Shipments Requiring Attention</h2>
          <Link
            href="/admin/shipments?state=NEEDS_ATTENTION"
            className="text-xs font-semibold text-accent hover:underline"
          >
            View all shipments →
          </Link>
        </div>

        {attentionShipments.length === 0 ? (
          <p className="mt-4 text-center text-sm text-gray-500 py-6">
            ✓ All shipments are operating normally. No pending retry issues.
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b bg-gray-50 text-gray-500 uppercase">
                <tr>
                  <th className="px-3 py-2">Order #</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2">State</th>
                  <th className="px-3 py-2">Attempts</th>
                  <th className="px-3 py-2">Last Error</th>
                  <th className="px-3 py-2">Updated</th>
                  <th className="px-3 py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {attentionShipments.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-3 font-semibold text-gray-900">
                      <Link href={`/orders/${s.order.orderNumber}`} className="hover:underline">
                        #{s.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono">{s.merchantRef}</td>
                    <td className="px-3 py-3">
                      <StatusBadge state={s.state} deliveryStatus={s.deliveryStatus} />
                    </td>
                    <td className="px-3 py-3 font-medium">{s.bookingAttempts} / 5</td>
                    <td className="px-3 py-3 max-w-xs truncate text-red-600 font-mono">
                      {s.lastBookingError ?? "None"}
                    </td>
                    <td className="px-3 py-3 text-gray-500 whitespace-nowrap">
                      {formatDateTime(s.updatedAt)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <form action={retryBooking} className="inline">
                        <input type="hidden" name="shipmentId" value={s.id} />
                        <button
                          type="submit"
                          className="rounded bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                        >
                          Retry
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* System Health Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Webhook Ingestion Health</h3>
          <p className="mt-1 text-xs text-gray-500">
            Recent rejected or malformed webhook attempts:{" "}
            <span
              className={`font-bold ${
                recentWebhookErrors > 0 ? "text-red-600" : "text-green-600"
              }`}
            >
              {recentWebhookErrors}
            </span>
          </p>
          <div className="mt-3">
            <Link
              href="/admin/webhooks"
              className="text-xs font-medium text-accent hover:underline"
            >
              Inspect webhook audit log →
            </Link>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Delivery Zones & Rates</h3>
          <p className="mt-1 text-xs text-gray-500">
            Sync provincial zones and tiered customer delivery rates with SwiftDrop ERP.
          </p>
          <div className="mt-3">
            <Link
              href="/admin/zones"
              className="text-xs font-medium text-accent hover:underline"
            >
              Manage zones and sync with ERP →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

