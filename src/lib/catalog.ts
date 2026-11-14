import { Prisma } from "@prisma/client";
import { db } from "./db";

export type ProductFilters = {
  q?: string;
  category?: string;
  size?: string;
  min?: string;
  max?: string;
  sort?: string;
};
export type SearchParams = Record<string, string | string[] | undefined>;

export const ALL_SIZES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11"];

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;

export function toFilters(sp: SearchParams): ProductFilters {
  return {
    q: one(sp.q),
    category: one(sp.category),
    size: one(sp.size),
    min: one(sp.min),
    max: one(sp.max),
    sort: one(sp.sort),
  };
}

export const productCardInclude = {
  category: true,
  variants: { select: { stock: true } },
} satisfies Prisma.ProductInclude;

export async function findProducts(f: ProductFilters) {
  const where: Prisma.ProductWhereInput = {};
  if (f.q) where.name = { contains: f.q, mode: "insensitive" };
  if (f.category) where.category = { slug: f.category };
  if (f.size) where.variants = { some: { name: { contains: f.size }, stock: { gt: 0 } } };

  const min = Number(f.min);
  const max = Number(f.max);
  if (min || max) where.basePrice = { ...(min ? { gte: min } : {}), ...(max ? { lte: max } : {}) };

  const orderBy: Prisma.ProductOrderByWithRelationInput =
    f.sort === "price_asc"
      ? { basePrice: "asc" }
      : f.sort === "price_desc"
        ? { basePrice: "desc" }
        : f.sort === "name"
          ? { name: "asc" }
          : { createdAt: "desc" };

  return db.product.findMany({ where, orderBy, include: productCardInclude });
}
