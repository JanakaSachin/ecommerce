import Link from "next/link";
import { db } from "@/lib/db";
import { ALL_SIZES, findProducts, type ProductFilters } from "@/lib/catalog";
import ProductCard from "./ProductCard";

const input = "rounded-md border border-gray-300 bg-white px-2 py-1.5 text-gray-900";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-gray-600">{label}</span>
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
      <h1 className="text-2xl font-bold text-gray-900">{title}</h1>

      <form
        action={basePath}
        className="mt-4 flex flex-wrap items-end gap-3 rounded-lg bg-white p-4 text-sm shadow-sm"
      >
        {filters.q && <input type="hidden" name="q" value={filters.q} />}
        {showCategoryFilter && (
          <Field label="Category">
            <select
              name="category"
              defaultValue={filters.category ?? ""}
              className={input}
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Size">
          <select name="size" defaultValue={filters.size ?? ""} className={input}>
            <option value="">Any Size</option>
            {ALL_SIZES.map((s) => (
              <option key={s} value={s}>
                Size {s}
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
            placeholder="50000"
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
          className="rounded-md bg-brand px-4 py-2 font-medium text-white transition hover:bg-brand-dark"
        >
          Apply Filters
        </button>
        <Link href={basePath} className="px-2 py-2 text-gray-500 underline">
          Reset
        </Link>
      </form>

      <p className="mt-4 text-sm text-gray-500">{products.length} products found</p>

      {products.length === 0 ? (
        <p className="mt-10 text-center text-gray-500">No shoes match your filters.</p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

