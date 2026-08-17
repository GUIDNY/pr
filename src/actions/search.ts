"use server";

import { db } from "@/lib/db";

export type SearchResult = {
  id: string;
  slug: string;
  title: string;
  brandName: string;
  categoryName: string;
  price: number;
  stockStatus: string;
  categoryIcon: string | null;
};

export async function searchProductsAction(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const rows = await db.product.findMany({
    where: {
      isPublished: true,
      stockQty: { gt: 0 },
      OR: [
        { title: { contains: q } },
        { sku: { contains: q } },
        { model: { contains: q } },
        { brand: { name: { contains: q } } },
        { category: { name: { contains: q } } },
      ],
    },
    include: { brand: true, category: { include: { parent: true } } },
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
  }));
}
