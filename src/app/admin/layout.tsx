import { requireAdmin } from "@/lib/session";
import AdminTabs from "@/components/admin/AdminTabs";

export const metadata = { title: "Admin Console – ChronoLK" };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  const mode = (process.env.SWIFTDROP_MODE ?? "mock").toLowerCase();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SwiftDrop Integration Console</h1>
          <p className="text-sm text-gray-500">Logged in as {admin.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
              mode === "live"
                ? "bg-green-100 text-green-800 border border-green-300"
                : "bg-amber-100 text-amber-800 border border-amber-300"
            }`}
          >
            SWIFTDROP_MODE: {mode}
          </span>
        </div>
      </div>
      <AdminTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}

