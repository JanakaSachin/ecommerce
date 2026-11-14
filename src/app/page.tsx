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
      {/* Hero banner */}
      <section className="relative h-[420px] overflow-hidden bg-brand-dark">
        <Image
          src="/hero.jpg"
          alt="StrideLK Shoes"
          fill
          priority
          className="object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-brand/95 via-brand/75 to-transparent" />
        <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-4 text-white">
          <p className="font-semibold uppercase tracking-widest text-accent">New Season Collection</p>
          <h1 className="mt-2 max-w-lg text-4xl font-extrabold md:text-5xl">
            Every step, delivered to your door.
          </h1>
          <p className="mt-4 max-w-md text-gray-200">
            Island-wide delivery powered by SwiftDrop. Pay securely with Cash on Delivery.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/products"
              className="rounded-md bg-accent px-6 py-3 font-semibold text-white transition hover:bg-accent-dark"
            >
              Shop now
            </Link>
            <Link
              href="/track"
              className="rounded-md border border-white px-6 py-3 font-semibold text-white transition hover:bg-white/10"
            >
              Track order
            </Link>
          </div>
        </div>
      </section>

      {/* Promo strip */}
      <section className="border-b border-gray-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-4 px-4 py-6 text-center text-sm md:grid-cols-3">
          <p>
            <span className="font-bold text-brand">Island-wide delivery</span> · all 25 districts
          </p>
          <p>
            <span className="font-bold text-brand">Cash on delivery</span> · pay upon arrival
          </p>
          <p>
            <span className="font-bold text-brand">Live order tracking</span> · powered by SwiftDrop
          </p>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-10">
        <h2 className="text-2xl font-bold text-gray-900">Shop by category</h2>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/category/${c.slug}`}
              className="group relative aspect-square overflow-hidden rounded-lg bg-gray-100 shadow-sm"
            >
              <Image
                src={c.products[0]?.imageUrl || "/hero.jpg"}
                alt={c.name}
                fill
                sizes="(max-width: 768px) 50vw, 16vw"
                className="object-cover transition duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/80 via-black/30 to-transparent p-3">
                <span className="font-bold text-white">{c.name}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured Products */}
      <section className="mx-auto max-w-7xl px-4 pb-12">
        <div className="flex items-end justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Featured shoes</h2>
          <Link
            href="/products"
            className="text-sm font-semibold text-accent hover:underline"
          >
            View all →
          </Link>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
