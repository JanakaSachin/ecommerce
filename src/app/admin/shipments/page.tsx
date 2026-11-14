import Link from "next/link";
import type { Prisma, ShipmentState } from "@prisma/client";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { isFinal } from "@/lib/tracking";
import {
  retryBooking,
  reship,
  pollShipmentNow,
  simulateNextStatus,
  simulateFailure,
} from "@/app/actions/admin";
import StatusBadge from "@/components/StatusBadge";
import Pager from "@/components/admin/Pager";
import Notice from "@/components/admin/Notice";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PAGE_SIZE = 20;
const STATES = [
  "PENDING_BOOKING",
  "BOOKED",
  "NEEDS_ATTENTION",
  "DELIVERED",
  "FAILED",
  "CANCELLED",
] as const;

export default async function AdminShipmentsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const stateFilter = STATES.find((s) => s === one(sp.state));
  const q = (one(sp.q) ?? "").trim();
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const isMock = (process.env.SWIFTDROP_MODE ?? "mock").toLowerCase() === "mock";

  const where: Prisma.ShipmentWhereInput = {};
  if (stateFilter) where.state = stateFilter as ShipmentState;
  if (q) {
    const digits = q.replace(/^#/, "");
    const n = /^\d{1,9}$/.test(digits) ? Number(digits) : null;
    where.OR = [
      ...(n ? [{ order: { orderNumber: n } }] : []),
      { merchantRef: { contains: q, mode: "insensitive" } },
      { trackingNumber: { contains: q, mode: "insensitive" } },
      { order: { customerName: { contains: q, mode: "insensitive" } } },
      { order: { email: { contains: q, mode: "insensitive" } } },
    ];
  }

  const [shipments, totalFiltered, countsByState] = await Promise.all([
    db.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        order: {
          include: {
            items: true,
          },
        },
      },
    }),
    db.shipment.count({ where }),
    db.shipment.groupBy({ by: ["state"], _count: { _all: true } }),
  ]);

  const countState = (s: string) => countsByState.find((g) => g.state === s)?._count._all ?? 0;
  const totalAll = countsByState.reduce((sum, g) => sum + g._count._all, 0);

  const pages = Math.ceil(totalFiltered / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Notice notice={one(sp.notice)} tone={one(sp.tone)} />

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <Link
            href="/admin/shipments"
            className={`rounded-full px-3 py-1 font-semibold transition ${
              !stateFilter ? "bg-brand text-white" : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            All ({totalAll})
          </Link>
          {STATES.map((s) => (
            <Link
              key={s}
              href={`/admin/shipments?state=${s}`}
              className={`rounded-full px-3 py-1 font-semibold transition ${
                stateFilter === s
                  ? "bg-brand text-white"
                  : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
              }`}
            >
              {s.replaceAll("_", " ")} ({countState(s)})
            </Link>
          ))}
        </div>

        {/* Search */}
        <form action="/admin/shipments" className="flex items-center gap-2">
          {stateFilter && <input type="hidden" name="state" value={stateFilter} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="Search order #, ref, tracking, customer..."
            className="w-64 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-900 outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
          >
            Search
          </button>
          {q && (
            <Link
              href={stateFilter ? `/admin/shipments?state=${stateFilter}` : "/admin/shipments"}
              className="text-xs text-gray-500 underline"
            >
              Clear
            </Link>
          )}
        </form>
      </div>

      {/* Shipments Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm border border-gray-100">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-gray-50 text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Order #</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Tracking #</th>
              <th className="px-4 py-3">Customer / City</th>
              <th className="px-4 py-3">State / Status</th>
              <th className="px-4 py-3">Attempts</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {shipments.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                  No shipments found matching criteria.
                </td>
              </tr>
            ) : (
              shipments.map((s) => {
                const isTerminal = isFinal(s.deliveryStatus);
                return (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-semibold text-gray-900">
                      <Link
                        href={`/orders/${s.order.orderNumber}`}
                        className="hover:underline text-brand"
                      >
                        #{s.order.orderNumber}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono">{s.merchantRef}</td>
                    <td className="px-4 py-3 font-mono font-medium text-brand">
                      {s.trackingNumber ?? <span className="text-gray-400">Not assigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{s.order.customerName}</p>
                      <p className="text-gray-500 text-xs">
                        {s.order.city}, {s.order.district}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge state={s.state} deliveryStatus={s.deliveryStatus} />
                    </td>
                    <td className="px-4 py-3">
                      <span>{s.bookingAttempts} / 5</span>
                      {s.attempt > 1 && (
                        <span className="ml-1 text-xs text-amber-700">(att #{s.attempt})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {formatDateTime(s.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5 flex-wrap">
                        {/* Retry Booking */}
                        {(s.state === "PENDING_BOOKING" || s.state === "NEEDS_ATTENTION") && (
                          <form action={retryBooking} className="inline">
                            <input type="hidden" name="shipmentId" value={s.id} />
                            <button
                              type="submit"
                              className="rounded bg-brand px-2 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                            >
                              Retry
                            </button>
                          </form>
                        )}

                        {/* Poll ERP */}
                        {s.trackingNumber && !isTerminal && (
                          <form action={pollShipmentNow} className="inline">
                            <input type="hidden" name="shipmentId" value={s.id} />
                            <button
                              type="submit"
                              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Poll
                            </button>
                          </form>
                        )}

                        {/* Mock Simulation Controls */}
                        {isMock && s.trackingNumber && !isTerminal && (
                          <>
                            <form action={simulateNextStatus} className="inline">
                              <input type="hidden" name="shipmentId" value={s.id} />
                              <button
                                type="submit"
                                className="rounded bg-indigo-600 px-2 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                              >
                                Next ▶
                              </button>
                            </form>
                            <form action={simulateFailure} className="inline">
                              <input type="hidden" name="shipmentId" value={s.id} />
                              <button
                                type="submit"
                                className="rounded border border-red-300 bg-white px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                              >
                                Fail ✕
                              </button>
                            </form>
                          </>
                        )}

                        {/* Re-ship after delivery failure */}
                        {s.state === "FAILED" && (
                          <form action={reship} className="inline">
                            <input type="hidden" name="shipmentId" value={s.id} />
                            <button
                              type="submit"
                              className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                            >
                              Re-ship
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Pager
        page={page}
        pages={pages}
        base="/admin/shipments"
        params={{ state: stateFilter, q: q || undefined }}
      />
    </div>
  );
}

