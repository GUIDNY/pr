import "server-only";
import { db } from "@/lib/db";
import type { ProductCardData } from "@/components/product/product-card";
import type { StockStatus } from "@/lib/enums";

const cardInclude = {
  brand: true,
  category: { include: { parent: true } },
} as const;

type ProductWithRelations = {
  id: string;
  slug: string;
  title: string;
  price: number;
  compareAtPrice: number | null;
  installmentMonths: number | null;
  stockStatus: string;
  ratingAvg: number;
  ratingCount: number;
  deliveryDays: number;
  brand: { name: string };
  category: { icon: string | null; parent: { icon: string | null } | null };
};

export function mapProductToCard(p: ProductWithRelations): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brandName: p.brand.name,
    categoryIcon: p.category.parent?.icon ?? p.category.icon,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    installmentMonths: p.installmentMonths,
    stockStatus: p.stockStatus as StockStatus,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    deliveryDays: p.deliveryDays,
  };
}

export async function getFeaturedProducts(take = 8) {
  const rows = await db.product.findMany({
    where: { isPublished: true, isFeatured: true },
    include: cardInclude,
    take,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapProductToCard);
}

export async function getBestSellers(take = 8) {
  const rows = await db.product.findMany({
    where: { isPublished: true, isBestSeller: true },
    include: cardInclude,
    take,
    orderBy: { ratingCount: "desc" },
  });
  return rows.map(mapProductToCard);
}

export async function getDeals(take = 8) {
  const rows = await db.product.findMany({
    where: { isPublished: true, compareAtPrice: { not: null } },
    include: cardInclude,
    take,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapProductToCard);
}

export type ProductSort = "relevance" | "price-asc" | "price-desc" | "newest" | "rating";

export async function getProductsByCategorySlug(
  categorySlug: string,
  opts: {
    sort?: ProductSort;
    page?: number;
    pageSize?: number;
    brandSlugs?: string[];
    minPrice?: number;
    maxPrice?: number;
    inStockOnly?: boolean;
    attributeFilters?: Record<string, string[]>;
  } = {}
) {
  const category = await db.category.findUnique({ where: { slug: categorySlug }, include: { children: true } });
  if (!category) return { products: [], total: 0, category: null, brands: [], priceRange: null };

  const categoryIds = category.children.length > 0 ? category.children.map((c) => c.id) : [category.id];

  const where: Record<string, unknown> = {
    isPublished: true,
    categoryId: { in: categoryIds },
  };

  if (opts.brandSlugs && opts.brandSlugs.length > 0) {
    where.brand = { slug: { in: opts.brandSlugs } };
  }
  if (opts.minPrice !== undefined || opts.maxPrice !== undefined) {
    where.price = {
      ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}),
      ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}),
    };
  }
  if (opts.inStockOnly) {
    where.stockStatus = { in: ["IN_STOCK", "LOW_STOCK"] };
  }
  if (opts.attributeFilters && Object.keys(opts.attributeFilters).length > 0) {
    where.AND = Object.entries(opts.attributeFilters).map(([key, values]) => ({
      attributeValues: { some: { attribute: { key }, value: { in: values } } },
    }));
  }

  const orderBy =
    opts.sort === "price-asc"
      ? { price: "asc" as const }
      : opts.sort === "price-desc"
        ? { price: "desc" as const }
        : opts.sort === "newest"
          ? { createdAt: "desc" as const }
          : opts.sort === "rating"
            ? { ratingAvg: "desc" as const }
            : { isBestSeller: "desc" as const };

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 24;

  const [rows, total, brandsInCategory, priceAgg] = await Promise.all([
    db.product.findMany({
      where,
      include: cardInclude,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.product.count({ where }),
    db.brand.findMany({
      where: { products: { some: { categoryId: { in: categoryIds }, isPublished: true } } },
      orderBy: { name: "asc" },
    }),
    db.product.aggregate({
      where: { isPublished: true, categoryId: { in: categoryIds } },
      _min: { price: true },
      _max: { price: true },
    }),
  ]);

  return {
    products: rows.map(mapProductToCard),
    total,
    category,
    brands: brandsInCategory,
    priceRange: { min: priceAgg._min.price ?? 0, max: priceAgg._max.price ?? 0 },
  };
}

export async function getCategoryFilterAttributes(categorySlug: string) {
  const category = await db.category.findUnique({ where: { slug: categorySlug }, include: { children: true } });
  if (!category) return [];
  const categoryIds = category.children.length > 0 ? category.children.map((c) => c.id) : [category.id];

  const attrs = await db.categoryAttribute.findMany({
    where: { categoryId: { in: categoryIds }, isFilter: true },
    orderBy: { sortOrder: "asc" },
  });

  // de-dupe by key across sibling leaf categories (e.g. all fridge subtypes share "capacity")
  const seen = new Map<string, (typeof attrs)[number]>();
  for (const a of attrs) if (!seen.has(a.key)) seen.set(a.key, a);
  return Array.from(seen.values());
}

export async function getProductBySlug(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      brand: true,
      category: { include: { parent: true } },
      images: { orderBy: { sortOrder: "asc" } },
      attributeValues: { include: { attribute: true }, orderBy: { attribute: { sortOrder: "asc" } } },
      reviews: { where: { isApproved: true }, orderBy: { createdAt: "desc" } },
      supplier: true,
    },
  });
}

export async function getRelatedProducts(categoryId: string, excludeId: string, take = 4) {
  const rows = await db.product.findMany({
    where: { categoryId, isPublished: true, id: { not: excludeId } },
    include: cardInclude,
    take,
    orderBy: { ratingCount: "desc" },
  });
  return rows.map(mapProductToCard);
}

export async function getProductsByBrandSlug(
  brandSlug: string,
  opts: { sort?: ProductSort; page?: number; pageSize?: number } = {}
) {
  const brand = await db.brand.findUnique({ where: { slug: brandSlug } });
  if (!brand) return { products: [], total: 0, brand: null };

  const orderBy =
    opts.sort === "price-asc"
      ? { price: "asc" as const }
      : opts.sort === "price-desc"
        ? { price: "desc" as const }
        : opts.sort === "newest"
          ? { createdAt: "desc" as const }
          : opts.sort === "rating"
            ? { ratingAvg: "desc" as const }
            : { isBestSeller: "desc" as const };

  const page = opts.page ?? 1;
  const pageSize = opts.pageSize ?? 24;
  const where = { isPublished: true, brandId: brand.id };

  const [rows, total] = await Promise.all([
    db.product.findMany({ where, include: cardInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.product.count({ where }),
  ]);

  return { products: rows.map(mapProductToCard), total, brand };
}

export async function searchProducts(query: string, take = 8) {
  if (!query.trim()) return [];
  const rows = await db.product.findMany({
    where: {
      isPublished: true,
      OR: [
        { title: { contains: query } },
        { sku: { contains: query } },
        { model: { contains: query } },
        { brand: { name: { contains: query } } },
      ],
    },
    include: cardInclude,
    take,
  });
  return rows.map(mapProductToCard);
}
