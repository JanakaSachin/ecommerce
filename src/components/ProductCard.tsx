import Image from "next/image";
import Link from "next/link";
import { formatLKR } from "@/lib/money";

type Props = {
  product: {
    id?: string;
    slug: string;
    name: string;
    basePrice: number;
    imageUrl?: string | null;
    category?: { name: string } | null;
    variants: { stock: number }[];
  };
};

export default function ProductCard({ product }: Props) {
  const inStock = product.variants.some((v) => v.stock > 0);
  const imageSrc = product.imageUrl || "/watches/watch-01.jpg";

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group flex flex-col overflow-hidden rounded-lg bg-white shadow-sm transition duration-300 hover:shadow-lg border border-gray-100 hover:border-teal-300/50"
    >
      <div className="relative aspect-square bg-gray-50 overflow-hidden">
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition duration-500 group-hover:scale-105"
        />
        {!inStock && (
          <span className="absolute left-2.5 top-2.5 rounded bg-gray-900/90 px-2 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
            Sold out
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        {product.category && (
          <p className="text-[11px] font-bold uppercase tracking-wider text-accent">
            {product.category.name}
          </p>
        )}
        <h3 className="line-clamp-2 mt-1 text-sm font-semibold text-gray-900 group-hover:text-brand transition">
          {product.name}
        </h3>
        <div className="mt-auto pt-3 flex items-center justify-between">
          <p className="text-base font-bold text-brand">{formatLKR(product.basePrice)}</p>
          <span className="text-xs text-accent font-semibold group-hover:underline">View →</span>
        </div>
      </div>
    </Link>
  );
}
