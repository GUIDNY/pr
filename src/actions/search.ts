"use server";

import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { parseShoppingQuery, splitSearchWords } from "@/lib/shopping-query";

export type SearchResult = {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  categoryName: string;
  price: number;
  stockStatus: string;
  categoryIcon: string | null;
  imageUrl: string | null;
};

export async function searchProductsAction(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { text, maxPrice } = parseShoppingQuery(q);
  const words = splitSearchWords(text);

  const rows = await db.product.findMany({
    where: {
      ...PUBLIC_PRODUCT_WHERE,
      ...(maxPrice !== null ? { price: { lte: maxPrice } } : {}),
      ...(words.length > 0
        ? {
            OR: words.flatMap((w) => [
              { title: { contains: w, mode: "insensitive" as const } },
              { sku: { contains: w, mode: "insensitive" as const } },
              { model: { contains: w, mode: "insensitive" as const } },
              { brand: { name: { contains: w, mode: "insensitive" as const } } },
              { category: { name: { contains: w, mode: "insensitive" as const } } },
            ]),
          }
        : {}),
    },
    include: {
      brand: true,
      category: { include: { parent: true } },
      images: { take: 1, orderBy: { sortOrder: "asc" } },
    },
    take: 8,
  });

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    brandName: p.brand.name,
    categoryName: p.category.name,
    price: p.price,
    stockStatus: p.stockStatus,
    categoryIcon: p.category.parent?.icon ?? p.category.icon,
    imageUrl: p.images[0]?.url ?? null,
  }));
}
