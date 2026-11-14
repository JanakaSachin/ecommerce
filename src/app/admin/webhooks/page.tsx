import Link from "next/link";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/dates";
import Pager from "@/components/admin/Pager";
import Notice from "@/components/admin/Notice";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PAGE_SIZE = 25;
const RESULTS = ["PROCESSED", "REJECTED", "IGNORED", "ERROR"] as const;

const RESULT_STYLES: Record<string, string> = {
  PROCESSED: "bg-green-100 text-green-800 border border-green-200",
  REJECTED: "bg-red-100 text-red-800 border border-red-200",
  IGNORED: "bg-gray-100 text-gray-800 border border-gray-200",
  ERROR: "bg-red-200 text-red-900 border border-red-300",
};

export default async function AdminWebhooksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const resultFilter = RESULTS.find((r) => r === one(sp.result));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  const where = resultFilter ? { result: resultFilter } : {};

  const [logs, totalFiltered, countsByResult] = await Promise.all([
    db.webhookLog.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.webhookLog.count({ where }),
    db.webhookLog.groupBy({ by: ["result"], _count: { _all: true } }),
  ]);

  const countResult = (r: string) =>
    countsByResult.find((g) => g.result === r)?._count._all ?? 0;
  const totalAll = countsByResult.reduce((sum, g) => sum + g._count._all, 0);

  const pages = Math.ceil(totalFiltered / PAGE_SIZE);

  return (
    <div className="space-y-4">
      <Notice notice={one(sp.notice)} tone={one(sp.tone)} />

      <div className="rounded-lg bg-white p-4 shadow-sm border border-gray-100">
        <h2 className="text-base font-semibold text-gray-900">SwiftDrop Webhook Audit Trail</h2>
        <p className="mt-1 text-xs text-gray-500">
          Logs all inbound POST requests to{" "}
          <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">/api/webhooks/swiftdrop</code>.
          Processed events are idempotent and uniquely deduplicated on{" "}
          <code className="font-mono bg-gray-100 px-1 py-0.5 rounded">eventId</code>.
        </p>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 text-xs">
        <Link
          href="/admin/webhooks"
          className={`rounded-full px-3 py-1 font-semibold transition ${
            !resultFilter
              ? "bg-brand text-white"
              : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
          }`}
        >
          All Events ({totalAll})
        </Link>
        {RESULTS.map((r) => (
          <Link
            key={r}
            href={`/admin/webhooks?result=${r}`}
            className={`rounded-full px-3 py-1 font-semibold transition ${
              resultFilter === r
                ? "bg-brand text-white"
                : "bg-white text-gray-700 shadow-sm hover:bg-gray-50"
            }`}
          >
            {r} ({countResult(r)})
          </Link>
        ))}
      </div>

      {/* Webhook Logs Table */}
      <div className="overflow-x-auto rounded-lg bg-white shadow-sm border border-gray-100">
        <table className="w-full text-left text-xs">
          <thead className="border-b bg-gray-50 text-gray-500 uppercase">
            <tr>
              <th className="px-4 py-3">Received At</th>
              <th className="px-4 py-3">Result</th>
              <th className="px-4 py-3">Signature</th>
              <th className="px-4 py-3">Event ID</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Error / Note</th>
              <th className="px-4 py-3">Payload Preview</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-gray-500">
                  No webhook logs found.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const payloadStr = log.payload ? JSON.stringify(log.payload) : null;
                return (
                  <tr key={log.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDateTime(log.receivedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          RESULT_STYLES[log.result] ?? "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {log.result}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.signatureValid ? (
                        <span className="font-semibold text-green-700">✓ Valid</span>
                      ) : (
                        <span className="font-semibold text-red-600">✕ Invalid</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-800">
                      {log.eventId ?? log.rawEventId ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-700">
                      {log.eventType ?? "-"}
                    </td>
                    <td className="px-4 py-3 max-w-xs truncate text-red-600 font-mono text-[11px]">
                      {log.error ?? "-"}
                    </td>
                    <td className="px-4 py-3 max-w-sm">
                      {payloadStr ? (
                        <details className="text-gray-500">
                          <summary className="cursor-pointer text-brand hover:underline">
                            Inspect JSON
                          </summary>
                          <pre className="mt-1 max-h-36 overflow-auto rounded bg-gray-50 p-2 font-mono text-[10px] text-gray-800">
                            {JSON.stringify(log.payload, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-gray-400">Empty</span>
                      )}
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
        base="/admin/webhooks"
        params={{ result: resultFilter }}
      />
    </div>
  );
}

