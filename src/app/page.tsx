import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { productCardInclude } from "@/lib/catalog";
import ProductCard from "@/components/ProductCard";

export default async function HomePage() {
  const [categories, featured] = await Promise.all([
    db.category.findMany({
      include: { products: { take: 1, select: { imageUrl: true } } },
      orderBy: { name: "asc" },
    }),
    db.product.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: productCardInclude,
    }),
  ]);

  return (
    <div>
      {/* Hero Banner */}
      <section className="relative h-[480px] overflow-hidden bg-brand-dark">
        <Image
          src="/hero.jpg"
          alt="Luxury Watches StrideLK"
          fill
          priority
          className="object-cover opacity-80"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand/95 via-brand/80 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-4 text-white">
          <p className="font-semibold uppercase tracking-widest text-accent text-xs">
            Precision & Heritage Timepieces
          </p>
          <h1 className="mt-2 max-w-xl text-4xl font-extrabold tracking-tight md:text-5xl lg:text-6xl">
            Every second counts. Delivered to your door.
          </h1>
          <p className="mt-4 max-w-lg text-gray-200 text-sm md:text-base leading-relaxed">
            Curated mechanical, automatic, and chronograph timepieces. Fully insured island-wide delivery powered by SwiftDrop. Pay safely with Cash on Delivery.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="rounded-md bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-dark shadow-md"
            >
              Explore Collection
            </Link>
            <Link
              href="/track"
              className="rounded-md border border-white/60 px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Track Order
            </Link>
          </div>
        </div>
      </section>

      {/* Trust Badges */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 text-center text-sm md:grid-cols-3">
          <p className="text-gray-700">
            <span className="font-bold text-brand">Insured Island-wide Delivery</span> · all 25 districts
          </p>
          <p className="text-gray-700">
            <span className="font-bold text-brand">Cash on Delivery</span> · inspect upon arrival
          </p>
          <p className="text-gray-700">
            <span className="font-bold text-brand">Live Parcel Tracking</span> · powered by SwiftDrop
          </p>
        </div>
      </section>

      {/* Collections Grid */}
      <section className="mx-auto max-w-7xl px-4 py-12">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Browse by Style</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">Curated Collections</h2>
          </div>
          <Link href="/products" className="text-sm font-semibold text-accent hover:underline">
            All Watches →
          </Link>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className="group relative aspect-square overflow-hidden rounded-lg bg-gray-900 shadow-sm"
            >
              <Image
                src={c.products[0]?.imageUrl || "/watches/watch-01.jpg"}
                alt={c.name}
                fill
                sizes="(max-width: 768px) 50vw, 16vw"
                className="object-cover transition duration-500 group-hover:scale-110 opacity-75 group-hover:opacity-90"
              />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/85 via-black/30 to-transparent p-3">
                <span className="font-bold text-white text-sm">{c.name}</span>
                <span className="text-[10px] text-gray-300">View collection →</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Timepieces */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <div className="flex items-end justify-between border-b border-gray-200 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent">Featured Releases</p>
            <h2 className="mt-1 text-2xl font-bold text-gray-900">Trending Timepieces</h2>
          </div>
          <Link
            href="/products"
            className="text-sm font-semibold text-accent hover:underline"
          >
            View all ({featured.length}) →
          </Link>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
