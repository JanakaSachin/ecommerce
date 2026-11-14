import Link from "next/link";
import { db } from "@/lib/db";
import { ALL_SIZES, findProducts, type ProductFilters } from "@/lib/catalog";
import ProductCard from "./ProductCard";

const input = "rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-gray-600">{label}</span>
      {children}
    </label>
  );
}

export default async function ProductListing({
  title,
  filters,
  basePath,
  showCategoryFilter = false,
}: {
  title: string;
  filters: ProductFilters;
  basePath: string;
  showCategoryFilter?: boolean;
}) {
  const [products, categories] = await Promise.all([
    findProducts(filters),
    showCategoryFilter ? db.category.findMany({ orderBy: { name: "asc" } }) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 pb-3">
        <h1 className="text-2xl font-extrabold text-gray-900">{title}</h1>
        <p className="text-xs font-medium text-teal-700 bg-teal-50 px-2.5 py-1 rounded-full border border-teal-200">
          {products.length} timepiece{products.length !== 1 ? "s" : ""} available
        </p>
      </div>

      <form
        action={basePath}
        className="mt-5 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 shadow-sm border border-gray-100"
      >
        {filters.q && <input type="hidden" name="q" value={filters.q} />}
        {showCategoryFilter && (
          <Field label="Collection">
            <select
              name="category"
              defaultValue={filters.category ?? ""}
              className={input}
            >
              <option value="">All Collections</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Case Size / Strap">
          <select name="size" defaultValue={filters.size ?? ""} className={input}>
            <option value="">Any Size / Material</option>
            {ALL_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Min price (LKR)">
          <input
            name="min"
            type="number"
            min={0}
            defaultValue={filters.min}
            placeholder="0"
            className={`${input} w-28`}
          />
        </Field>
        <Field label="Max price (LKR)">
          <input
            name="max"
            type="number"
            min={0}
            defaultValue={filters.max}
            placeholder="100000"
            className={`${input} w-28`}
          />
        </Field>
        <Field label="Sort by">
          <select name="sort" defaultValue={filters.sort ?? ""} className={input}>
            <option value="">Featured</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="name">Name: A to Z</option>
          </select>
        </Field>
        <button
          type="submit"
          className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark shadow-sm"
        >
          Apply Filters
        </button>
        <Link href={basePath} className="px-2 py-2 text-xs font-medium text-gray-500 hover:text-gray-800 underline">
          Reset
        </Link>
      </form>

      {products.length === 0 ? (
        <div className="mt-10 rounded-lg bg-white p-12 text-center shadow-sm border border-gray-100">
          <p className="text-gray-500">No timepieces match your selected filters.</p>
          <Link
            href={basePath}
            className="mt-3 inline-block text-sm font-semibold text-accent hover:underline"
          >
            Clear filters
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
