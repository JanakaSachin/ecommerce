import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { productCardInclude } from "@/lib/catalog";
import { formatLKR } from "@/lib/money";
import SizePicker from "@/components/SizePicker";
import ProductCard from "@/components/ProductCard";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = await db.product.findUnique({
    where: { slug },
    include: {
      category: true,
      variants: { orderBy: { sku: "asc" } },
    },
  });

  if (!product) notFound();

  const related = await db.product.findMany({
    where: { categoryId: product.categoryId, id: { not: product.id } },
    take: 4,
    include: productCardInclude,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <nav className="text-sm text-gray-500">
        <Link href="/" className="hover:underline">
          Home
        </Link>{" "}
        /{" "}
        <Link href={`/category/${product.category.slug}`} className="hover:underline">
          {product.category.name}
        </Link>{" "}
        / <span className="text-gray-800">{product.name}</span>
      </nav>

      <div className="mt-6 grid gap-10 md:grid-cols-2">
        <div className="relative aspect-square overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
          <Image
            src={product.imageUrl || "/watches/watch-01.jpg"}
            alt={product.name}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
          />
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent">
            {product.category.name}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold text-gray-900 tracking-tight">
            {product.name}
          </h1>
          <p className="mt-2 text-2xl font-bold text-accent">
            {formatLKR(product.basePrice)}
          </p>
          <p className="mt-4 text-gray-700 leading-relaxed text-sm">
            {product.description}
          </p>

          <SizePicker variants={product.variants} />

          <div className="mt-8 rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-700 shadow-sm space-y-2">
            <p className="flex items-center gap-2">
              <span>🚚</span>
              <span>
                Insured express delivery by <span className="font-semibold text-brand">SwiftDrop</span>, island-wide in 1–3 days
              </span>
            </p>
            <p className="flex items-center gap-2">
              <span>💵</span>
              <span>Cash on Delivery (COD) · Inspect item before paying courier</span>
            </p>
            <p className="flex items-center gap-2">
              <span>🛡️</span>
              <span>1-Year Movement & Craftsmanship Warranty included</span>
            </p>
            <p className="flex items-center gap-2">
              <span>📍</span>
              <span>Real-time GPS & checkpoint tracking after dispatch</span>
            </p>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 border-t border-gray-200 pt-10">
          <h2 className="text-xl font-bold text-gray-900">Complementary Timepieces</h2>
          <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-4">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
