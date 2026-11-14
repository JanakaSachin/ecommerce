import Link from "next/link";

type Props = {
  page: number;
  pages: number;
  base: string;
  params: Record<string, string | undefined>;
};

export default function Pager({ page, pages, base, params }: Props) {
  if (pages <= 1) return null;

  const href = (p: number) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) sp.set(k, v);
    }
    if (p > 1) sp.set("page", String(p));
    const s = sp.toString();
    return s ? `${base}?${s}` : base;
  };

  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-gray-500">
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 && (
          <Link
            href={href(page - 1)}
            className="rounded border border-gray-300 bg-white px-3 py-1 font-medium hover:bg-gray-50"
          >
            ← Previous
          </Link>
        )}
        {page < pages && (
          <Link
            href={href(page + 1)}
            className="rounded border border-gray-300 bg-white px-3 py-1 font-medium hover:bg-gray-50"
          >
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

