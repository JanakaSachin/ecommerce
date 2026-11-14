import ProductListing from "@/components/ProductListing";
import { toFilters, type SearchParams } from "@/lib/catalog";

export const metadata = { title: "All Watches – StrideLK Timepieces" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = toFilters(await searchParams);
  return (
    <ProductListing
      title={filters.q ? `Results for "${filters.q}"` : "All Watches & Timepieces"}
      filters={filters}
      basePath="/products"
      showCategoryFilter
    />
  );
}
