import "server-only";
import { db } from "@/lib/db";
import type { ProductCardData } from "@/components/product/product-card";
import type { StockStatus } from "@/lib/enums";
import { parseShoppingQuery, splitSearchWords } from "@/lib/shopping-query";

const cardInclude = {
  brand: true,
  category: { include: { parent: true } },
  images: { take: 1, orderBy: { sortOrder: "asc" as const } },
} as const;

// Store policy, in one place. Spread this into every customer-facing
// product query rather than re-deriving it, since isPublished on its own
// goes stale (a product sells out after an admin published it) while these
// conditions are always the live truth.
//
//  - stockQty > 0: an out-of-stock product is not shown anywhere at all,
//    not even with an "out of stock" badge.
//  - images.some: neither is a product with no photograph. The card and
//    gallery both fall back to a generated placeholder tile, which is what
//    a shopper was being shown for hundreds of products — a coloured square
//    with a category icon standing in for the thing they were being asked
//    to buy. A product with no picture of itself is not ready to be sold.
//
// Both are query-time gates rather than an isPublished flip on purpose: a
// product returns to the site the moment it has stock and a photo, with no
// sync run in between, and isPublished keeps meaning what it says — that a
// person or the sync deliberately hid this — instead of being overloaded
// with "and also it happens to be missing content right now".
export const PUBLIC_PRODUCT_WHERE = {
  isPublished: true,
  stockQty: { gt: 0 },
  images: { some: {} },
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
  images: { url: string }[];
};

export function mapProductToCard(p: ProductWithRelations): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    brandName: p.brand.name,
    categoryIcon: p.category.parent?.icon ?? p.category.icon,
    imageUrl: p.images[0]?.url ?? null,
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
    where: { ...PUBLIC_PRODUCT_WHERE, isFeatured: true },
    include: cardInclude,
    take,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapProductToCard);
}

export async function getBestSellers(take = 8) {
  const rows = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, isBestSeller: true },
    include: cardInclude,
    take,
    orderBy: { ratingCount: "desc" },
  });
  return rows.map(mapProductToCard);
}

export async function getDeals(take = 8) {
  const rows = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, compareAtPrice: { not: null } },
    include: cardInclude,
    take,
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(mapProductToCard);
}

// Resolves an admin-curated list of specific product IDs (e.g. the
// homepage "אלפרד ממליץ" widget) back into real cards, in the given order,
// silently dropping any id that's been unpublished/sold out/deleted since
// it was picked rather than erroring — same "no fake placeholder" policy
// as the rest of the homepage.
export async function getProductsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await db.product.findMany({
    where: { id: { in: ids }, ...PUBLIC_PRODUCT_WHERE },
    include: cardInclude,
  });
  const byId = new Map(rows.map((r) => [r.id, mapProductToCard(r)]));
  return ids.map((id) => byId.get(id)).filter((p): p is ProductCardData => !!p);
}

export type ProductSort = "relevance" | "price-asc" | "price-desc" | "newest" | "rating";

// A department page shows everything under it — its sub-categories AND the
// products hanging directly off the department itself. The department's own
// id used to be dropped the moment it had any children, which quietly hid
// 224 live products: 164 refrigerators, 38 small kitchen appliances and 22
// personal care. /category/personal-care rendered "לא נמצאו מוצרים" on a
// department with 22 products in it, and every one of those 164 fridges was
// unreachable by browsing the site at all — the eight fridge sub-categories
// they belong in are empty, so there was no other page carrying them
// either.
//
// Products sit on a department because sheet-map.ts maps a whole supplier
// tab to one broad category on purpose (the tabs mix sub-types with no
// per-row category column), so this is the normal state of a freshly
// imported product, not an anomaly to design around. They still need
// classifying — a product on a department has no CategoryAttribute schema
// to fill — but until then it must at least be findable.
function categoryScope(category: { id: string; children: { id: string }[] }): string[] {
  return [category.id, ...category.children.map((c) => c.id)];
}

export async function getProductsByCategorySlug(
  categorySlug: string,
  opts: {
    sort?: ProductSort;
    page?: number;
    pageSize?: number;
    brandSlugs?: string[];
    minPrice?: number;
    maxPrice?: number;
    attributeFilters?: Record<string, string[]>;
  } = {}
) {
  const category = await db.category.findUnique({ where: { slug: categorySlug }, include: { children: true } });
  if (!category) return { products: [], total: 0, category: null, brands: [], priceRange: null };

  const categoryIds = categoryScope(category);

  const where: Record<string, unknown> = {
    ...PUBLIC_PRODUCT_WHERE,
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
      where: { products: { some: { categoryId: { in: categoryIds }, ...PUBLIC_PRODUCT_WHERE } } },
      orderBy: { name: "asc" },
    }),
    db.product.aggregate({
      where: { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: categoryIds } },
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
  const categoryIds = categoryScope(category);

  const attrs = await db.categoryAttribute.findMany({
    where: { categoryId: { in: categoryIds }, isFilter: true },
    orderBy: { sortOrder: "asc" },
  });

  // de-dupe by key across sibling leaf categories (e.g. all fridge subtypes share "capacity")
  const seen = new Map<string, (typeof attrs)[number]>();
  for (const a of attrs) if (!seen.has(a.key)) seen.set(a.key, a);
  return Array.from(seen.values());
}

// Every attribute defined for a product's own category, regardless of
// whether it currently has a value — used for the admin inline spec editor
// on the product page, which needs to offer *unfilled* fields too, not just
// render whatever's already set.
export async function getCategoryAttributesFor(categoryId: string) {
  return db.categoryAttribute.findMany({ where: { categoryId }, orderBy: { sortOrder: "asc" } });
}

export async function getProductBySlug(slug: string) {
  return db.product.findUnique({
    where: { slug },
    include: {
      brand: { include: { images: { orderBy: { sortOrder: "asc" } } } },
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
    where: { ...PUBLIC_PRODUCT_WHERE, categoryId, id: { not: excludeId } },
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
  const where = { ...PUBLIC_PRODUCT_WHERE, brandId: brand.id };

  const [rows, total] = await Promise.all([
    db.product.findMany({ where, include: cardInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.product.count({ where }),
  ]);

  return { products: rows.map(mapProductToCard), total, brand };
}

export async function searchProducts(query: string, take = 8) {
  if (!query.trim()) return [];
  const { text, maxPrice } = parseShoppingQuery(query);
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
    include: cardInclude,
    take,
  });
  return rows.map(mapProductToCard);
}
