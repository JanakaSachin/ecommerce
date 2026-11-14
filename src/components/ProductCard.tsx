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
  const imageSrc = product.imageUrl || "/hero.jpg";

  return (
    <Link
      href={`/products/${product.slug}`}
      className="group block overflow-hidden rounded-lg bg-white shadow-sm transition hover:shadow-md"
    >
      <div className="relative aspect-square bg-gray-100">
        <Image
          src={imageSrc}
          alt={product.name}
          fill
          sizes="(max-width: 768px) 50vw, 25vw"
          className="object-cover transition duration-300 group-hover:scale-105"
        />
        {!inStock && (
          <span className="absolute left-2 top-2 rounded bg-gray-800 px-2 py-0.5 text-xs text-white">
            Sold out
          </span>
        )}
      </div>
      <div className="p-3">
        {product.category && (
          <p className="text-xs uppercase text-gray-500">{product.category.name}</p>
        )}
        <h3 className="line-clamp-1 font-semibold text-gray-900">{product.name}</h3>
        <p className="mt-1 font-bold text-accent">{formatLKR(product.basePrice)}</p>
      </div>
    </Link>
  );
}

