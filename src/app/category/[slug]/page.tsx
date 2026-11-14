import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import ProductListing from "@/components/ProductListing";
import { toFilters, type SearchParams } from "@/lib/catalog";

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { slug } = await params;
  const category = await db.category.findUnique({ where: { slug } });
  if (!category) notFound();

  return (
    <ProductListing
      title={category.name}
      filters={{ ...toFilters(await searchParams), category: slug }}
      basePath={`/category/${slug}`}
    />
  );
}
