import "server-only";
import { db } from "@/lib/db";
import type { ProductCardData } from "@/components/product/product-card";
import type { StockStatus } from "@/lib/enums";
import { parseShoppingQuery, splitSearchWords } from "@/lib/shopping-query";
import { isPlaceholderBrand } from "@/lib/brand-display";
import { buildDisplayTitle } from "@/lib/product-title";

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
  model: string | null;
  price: number;
  compareAtPrice: number | null;
  installmentMonths: number | null;
  stockStatus: string;
  ratingAvg: number;
  ratingCount: number;
  deliveryDays: number;
  brand: { name: string };
  category: { name: string; icon: string | null; parent: { icon: string | null } | null };
  images: { url: string }[];
};

export function mapProductToCard(p: ProductWithRelations): ProductCardData {
  return {
    id: p.id,
    slug: p.slug,
    // Composed here rather than read straight off the column — see
    // lib/product-title.ts for why the sheets' own titles are unusable as
    // product names on their own.
    title: buildDisplayTitle({
      title: p.title,
      brandName: p.brand.name,
      categoryName: p.category.name,
      model: p.model,
    }),
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

  const categoryIds = category.children.length > 0 ? category.children.map((c) => c.id) : [category.id];

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
    // "לא ידוע" is a filing placeholder, not a manufacturer — offering it as
    // a checkbox in the יצרן filter invites a customer to narrow a category
    // down to "the ones we could not identify".
    brands: brandsInCategory.filter((b) => !isPlaceholderBrand(b.name)),
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

// How well one product answers a multi-word query. The `where` above is an
// OR across every word and every field, which is the right call for recall on
// a catalog whose titles are half model numbers — but it means a product
// matching one word out of four sits in the same result set as one matching
// all four, and with no ordering at all the database was free to hand back
// the weakest match first. That is how "תנור בנוי עד 3000 ₪" led with a water
// bar: it was simply the first row that matched anything.
//
// A category-name hit counts double: it says the product is the right *kind*
// of thing, which is what a shopper naming a product type is asking for, and
// it is the one signal that separates an oven from something merely described
// with the word "oven" in it.
function searchRelevance(
  product: { title: string; model: string | null; sku: string; brand: { name: string }; category: { name: string } },
  words: string[],
): number {
  const identity = [product.title, product.model, product.sku, product.brand.name].join(" ").toLowerCase();
  const categoryName = product.category.name.toLowerCase();
  let score = 0;
  for (const word of words) {
    const w = word.toLowerCase();
    if (categoryName.includes(w)) score += 2;
    if (identity.includes(w)) score += 1;
  }
  return score;
}

export async function searchProducts(
  query: string,
  take = 8,
  // A caller that has already read a price ceiling out of the raw message
  // passes it here. The chat endpoint strips the "עד 3000 ₪" phrase from the
  // text before searching, so by the time the string arrives the ceiling is
  // gone from it — it used to be silently dropped, and Alfred answered a
  // 3,000₪ budget with a 3,790₪ oven.
  maxPriceOverride?: number | null,
) {
  if (!query.trim()) return [];
  const { text, maxPrice: parsedMaxPrice } = parseShoppingQuery(query);
  const maxPrice = maxPriceOverride ?? parsedMaxPrice;
  const words = splitSearchWords(text);
  const rows = await db.product.findMany({
    where: {
      ...PUBLIC_PRODUCT_WHERE,
      ...(maxPrice !== null && maxPrice !== undefined ? { price: { lte: maxPrice } } : {}),
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
    // Over-fetch so there is something to rank. Ranking the first `take` rows
    // the database happened to return would just be sorting an arbitrary
    // sample of the matches.
    take: Math.min(take * 6, 200),
  });

  return rows
    .map((row) => ({ row, relevance: searchRelevance(row, words) }))
    .sort((a, b) => b.relevance - a.relevance || b.row.ratingAvg - a.row.ratingAvg)
    .slice(0, take)
    .map(({ row }) => mapProductToCard(row));
}
