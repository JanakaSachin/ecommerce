import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import { formatLKR } from "@/lib/money";
import { syncZonesAction } from "@/app/actions/admin";
import Notice from "@/components/admin/Notice";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminZonesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;

  const [zones, districts] = await Promise.all([
    db.deliveryZone.findMany({
      orderBy: { code: "asc" },
      include: {
        districts: true,
        rates: {
          orderBy: { size: "asc" },
        },
      },
    }),
    db.districtZone.findMany({
      orderBy: { district: "asc" },
      include: { zone: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <Notice notice={one(sp.notice)} tone={one(sp.tone)} />

      {/* Sync Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg bg-white p-5 shadow-sm border border-gray-100">
        <div>
          <h2 className="text-base font-semibold text-gray-900">SwiftDrop Delivery Zones & Rates</h2>
          <p className="mt-1 text-xs text-gray-500">
            Provincial zones determine courier routing and customer delivery rates across all 25 Sri Lankan districts.
          </p>
        </div>
        <form action={syncZonesAction}>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-dark"
          >
            Sync with SwiftDrop ERP ↻
          </button>
        </form>
      </div>

      {/* Zones Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Provincial Delivery Zones ({zones.length})</h3>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-gray-50 text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Zone Name</th>
              <th className="px-4 py-3">ERP Zone ID</th>
              <th className="px-4 py-3">Mapped Districts</th>
              <th className="px-4 py-3">Customer Rates (S / M / L)</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last Synced</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {zones.map((z) => {
              const smallRate = z.rates.find((r) => r.size === "SMALL")?.fee;
              const medRate = z.rates.find((r) => r.size === "MEDIUM")?.fee;
              const lrgRate = z.rates.find((r) => r.size === "LARGE")?.fee;

              return (
                <tr key={z.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-bold text-brand">{z.code}</td>
                  <td className="px-4 py-3 font-semibold text-gray-900">{z.name}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{z.id}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-700">{z.districts.length} districts</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {z.districts.map((d) => d.district).join(", ")}
                    </p>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-800">
                    {smallRate ? formatLKR(smallRate) : "-"} /{" "}
                    {medRate ? formatLKR(medRate) : "-"} /{" "}
                    {lrgRate ? formatLKR(lrgRate) : "-"}
                  </td>
                  <td className="px-4 py-3">
                    {z.active ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {formatDateTime(z.syncedAt)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* District Mapping Grid */}
      <div className="rounded-lg bg-white p-5 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 text-sm">District to Zone Mappings (All 25 Districts)</h3>
        <p className="mt-1 text-xs text-gray-500">
          Addresses entered at checkout are automatically resolved to these delivery zones for parcel routing and fee calculation.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
          {districts.map((d) => (
            <div
              key={d.district}
              className="flex items-center justify-between rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs"
            >
              <span className="font-medium text-gray-800">{d.district}</span>
              <span className="rounded bg-brand/10 px-1.5 py-0.5 font-bold text-brand">
                {d.zone.code}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

