"use server";

import { db } from "@/lib/db";
import { rankedSearchIds, inRankedOrder } from "@/lib/queries/products";

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

/**
 * The suggestions under the search box — the header's and the homepage
 * hero's, which are the same SearchBar component.
 *
 * This held its own copy of the query rather than calling one: the same OR
 * across words, the same missing ORDER BY, the same `take: 8`. So when the
 * ranking was fixed in queries/products.ts, /search started answering
 * correctly and the box on the homepage went on returning coffee machines
 * for "מכונת כביסה" — the copy nobody remembered was there, on the surface
 * every visitor touches first.
 *
 * It now asks the shared ranker for ids and loads only the columns this row
 * needs (categoryName, which the product card does not carry). Different
 * shape, one definition of what "matches" and "comes first" mean.
 */
export async function searchProductsAction(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const ids = await rankedSearchIds(q, 8);
  if (ids.length === 0) return [];

  const rows = await db.product.findMany({
    where: { id: { in: ids } },
    include: {
      brand: true,
      category: { include: { parent: true } },
      images: { take: 1, orderBy: { sortOrder: "asc" } },
    },
  });

  return inRankedOrder(ids, rows).map((p) => ({
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
