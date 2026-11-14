import { statusBadge } from "@/lib/tracking";

export default function StatusBadge({
  state,
  deliveryStatus,
}: {
  state?: string;
  deliveryStatus?: string | null;
}) {
  const b = statusBadge(state, deliveryStatus);
  return (
    <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${b.cls}`}>
      {b.label}
    </span>
  );
}
