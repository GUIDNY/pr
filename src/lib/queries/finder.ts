import "server-only";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { FINDER_CATEGORIES, type FinderConfig } from "@/lib/finder-config";

export type FinderCategoryCard = FinderConfig & {
  // Live products in the department, and one of their photographs — a
  // shopper picks a real thing off a shelf, not an icon of one.
  productCount: number;
  imageUrl: string | null;
};

/** Every product on the shelf right now — the shop's range, not the finder's. */
export async function getPublicProductCount(): Promise<number> {
  return db.product.count({ where: PUBLIC_PRODUCT_WHERE });
}

export async function getFinderCategoryCards(): Promise<FinderCategoryCard[]> {
  return Promise.all(
    FINDER_CATEGORIES.map(async (config) => {
      const category = await db.category.findUnique({
        where: { slug: config.categorySlug },
        select: { id: true, children: { select: { id: true } } },
      });
      if (!category) return { ...config, productCount: 0, imageUrl: null };
      const where = { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: [category.id, ...category.children.map((c) => c.id)] } };
      const [productCount, pick] = await Promise.all([
        db.product.count({ where }),
        db.product.findFirst({
          where,
          orderBy: [{ isBestSeller: "desc" }, { ratingAvg: "desc" }],
          select: { images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } } },
        }),
      ]);
      return { ...config, productCount, imageUrl: pick?.images[0]?.url ?? null };
    }),
  );
}
