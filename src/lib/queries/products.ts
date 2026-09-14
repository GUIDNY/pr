import "server-only";
import { cache } from "react";
import { normalizeFacetValue } from "@/lib/facet-value";
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
  sku: string;
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
    sku: p.sku,
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

/**
 * The most recently added live products — the homepage's "what's new"
 * rail. It claims nothing beyond what it is: these arrived, they are in
 * stock, here they are. (isBestSeller is set on nothing and there are no
 * reviews, so a "most popular" rail would be a rail with nothing in it or
 * a rail that lies.)
 */
export async function getNewArrivals(take = 8) {
  const rows = await db.product.findMany({
    where: PUBLIC_PRODUCT_WHERE,
    include: cardInclude,
    take,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapProductToCard);
}

export type DepartmentShowcase = {
  name: string;
  slug: string;
  count: number;
  products: ProductCardData[];
};

/**
 * One rail per department, biggest first: the department's name, how many
 * live products it holds, and a handful of them.
 *
 * This is the homepage's answer to the finding that shoppers misjudge what
 * a shop sells when its front page shows a narrow slice of it — a page
 * that opens on three kettles reads as a kettle shop. Fridges, ovens,
 * televisions and washing machines each get a row of real, in-stock
 * products with prices, so the breadth of the catalogue is shown rather
 * than described. A department with fewer live products than a row holds
 * is left out rather than padded.
 */
export async function getDepartmentShowcases({
  departments = 6,
  perDepartment = 4,
}: { departments?: number; perDepartment?: number } = {}): Promise<DepartmentShowcase[]> {
  const tree = await db.category.findMany({
    where: { parentId: null },
    select: { id: true, name: true, slug: true, children: { select: { id: true } } },
  });

  const counted = await Promise.all(
    tree.map(async (d) => {
      const categoryIds = [d.id, ...d.children.map((c) => c.id)];
      const count = await db.product.count({ where: { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: categoryIds } } });
      return { ...d, categoryIds, count };
    }),
  );

  const picked = counted
    .filter((d) => d.count >= perDepartment)
    .sort((a, b) => b.count - a.count)
    .slice(0, departments);

  return Promise.all(
    picked.map(async (d) => {
      const rows = await db.product.findMany({
        where: { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: d.categoryIds } },
        include: cardInclude,
        take: perDepartment,
        // Enriched products first — "ENRICHED" sorts ahead of the other
        // two values ascending — since those are the ones with a written
        // description and checked specs behind the card; then the newest.
        // A stable, honest order that needs no sales history to exist.
        orderBy: [{ enrichmentStatus: "asc" }, { createdAt: "desc" }],
      });
      return { name: d.name, slug: d.slug, count: d.count, products: rows.map(mapProductToCard) };
    }),
  );
}

/**
 * How big the shop is, as a fact the homepage can state.
 *
 * The public predicate, so the number is exactly what a visitor can browse
 * — not the 2,000 rows in the table, most of which are invisible for want of
 * a photo or stock. Brands are counted the same way: a brand with nothing
 * live is not a brand the shop carries today.
 */
export async function getCatalogSize() {
  const [products, brands] = await Promise.all([
    db.product.count({ where: PUBLIC_PRODUCT_WHERE }),
    db.brand.count({ where: { isActive: true, products: { some: PUBLIC_PRODUCT_WHERE } } }),
  ]);
  return { products, brands };
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

// Wrapped in React's cache so the route and the view it renders can each ask
// for the product without it being fetched twice: the route needs to know
// whether the slug misses (so it can redirect from an old address), and the
// view needs the product itself. Two call sites, one query per render.
export const getProductBySlug = cache(async (slug: string) => {
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
});

/**
 * The slug a product carries *now*, given an address it used to carry.
 *
 * Only ever called after a live-slug lookup has already missed, so it costs
 * nothing on the normal path — and the answer is what the product page 301s
 * to. Returns null when the address was never this shop's, which is the
 * ordinary 404.
 */
export async function getCurrentSlugForLegacySlug(slug: string): Promise<string | null> {
  const record = await db.productSlugHistory.findUnique({
    where: { slug },
    select: { product: { select: { slug: true } } },
  });
  const current = record?.product.slug ?? null;
  // A stale row pointing at itself would redirect the address to the address.
  return current && current !== slug ? current : null;
}

/**
 * The slug a brand carries now, given one it used to carry. Same shape and
 * same reasoning as getCurrentSlugForLegacySlug — a brand page is linked from
 * every product of that brand, so its address is public too.
 */
export async function getCurrentSlugForLegacyBrandSlug(slug: string): Promise<string | null> {
  const record = await db.brandSlugHistory.findUnique({
    where: { slug },
    select: { brand: { select: { slug: true } } },
  });
  const current = record?.brand.slug ?? null;
  return current && current !== slug ? current : null;
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

/**
 * What is actually there to filter by, and how much of it.
 *
 * The filters on a category page used to be built from CategoryAttribute's
 * `options` column — a list typed into the schema when the attribute was
 * defined, describing what values are *allowed* rather than which ones any
 * product has. On a live catalogue those are two very different lists, and
 * the gap between them was visible in both directions:
 *
 *   מקרר 4-5 דלתות showed "מיקום מקפיא: עליון / תחתון", because the schema
 *   says a fridge has a freezer position. Not one of its 58 live products
 *   has that value filled. Twenty-four products on screen, click the filter,
 *   zero — a dead end a shopper reads as "this shop has nothing".
 *
 *   מכונות כביסה did not show "קיבולת" at all, though 64 of its 71 live
 *   products have it and it is the first thing anyone asks about a washing
 *   machine. It has no `options` list, because capacity is a number, so it
 *   was invisible.
 *
 * So the options come from the products now, counted, and an option nobody
 * can reach is not offered. That is also what makes counts possible, and a
 * count is the difference between choosing and guessing.
 *
 * ONE DELIBERATE IMPRECISION. The counts apply the brand and price filters
 * but not the attribute ones, so with two attribute filters active a number
 * can read higher than what clicking it returns. Doing better means one
 * query per attribute per request, on every category page, to sharpen a
 * number in a case most shoppers never reach — while the direction that
 * matters is already right: nothing is ever offered at zero.
 */
/** `values` are the raw rows this one chip stands for — a chip reading "8"
    filters on both "8" and `8 ק"ג`, or it would quietly drop products. */
export type FacetOption = { value: string; count: number; values: string[] };
export type Facet = {
  key: string;
  label: string;
  unit: string | null;
  /** Share of the category's live products that have any value here, 0-1. */
  coverage: number;
  options: FacetOption[];
};

/* An attribute filled in by only a handful of products is worse than no
   filter: every option in it hides the overwhelming majority of the shelf,
   and the shopper cannot tell that what vanished was missing data rather
   than missing stock. Below this the attribute waits until the catalogue
   catches up. */
const MIN_FACET_COVERAGE = 0.3;

export async function getCategoryFacets(
  categorySlug: string,
  opts: { brandSlugs?: string[]; minPrice?: number; maxPrice?: number } = {}
): Promise<{ brands: (FacetOption & { name: string })[]; attributes: Facet[] }> {
  const category = await db.category.findUnique({
    where: { slug: categorySlug },
    include: { children: true },
  });
  if (!category) return { brands: [], attributes: [] };

  const categoryIds = categoryScope(category);
  const priceWhere =
    opts.minPrice !== undefined || opts.maxPrice !== undefined
      ? {
          price: {
            ...(opts.minPrice !== undefined ? { gte: opts.minPrice } : {}),
            ...(opts.maxPrice !== undefined ? { lte: opts.maxPrice } : {}),
          },
        }
      : {};

  const inCategory = { ...PUBLIC_PRODUCT_WHERE, categoryId: { in: categoryIds } };

  /* Brand counts ignore the brand filter on purpose. Picking Bosch must not
     make every other brand read zero — the shopper is choosing between
     brands, and a list that collapses the moment they choose one cannot be
     used to add a second. */
  const brandScope = { ...inCategory, ...priceWhere };
  const attrScope = {
    ...inCategory,
    ...priceWhere,
    ...(opts.brandSlugs && opts.brandSlugs.length > 0 ? { brand: { slug: { in: opts.brandSlugs } } } : {}),
  };

  const [brandGroups, brandRows, attributes, valueGroups, filledCounts, liveTotal] = await Promise.all([
    db.product.groupBy({ by: ["brandId"], where: brandScope, _count: { _all: true } }),
    db.brand.findMany({
      where: { products: { some: brandScope } },
      select: { id: true, name: true, slug: true },
    }),
    db.categoryAttribute.findMany({
      where: { categoryId: { in: categoryIds }, isFilter: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.productAttributeValue.groupBy({
      by: ["attributeId", "value"],
      where: { product: attrScope },
      _count: { _all: true },
    }),
    db.productAttributeValue.groupBy({
      by: ["attributeId"],
      where: { product: inCategory },
      _count: { _all: true },
    }),
    db.product.count({ where: inCategory }),
  ]);

  const brandCount = new Map(brandGroups.map((g) => [g.brandId, g._count._all]));
  const brands = brandRows
    .map((b) => ({ name: b.name, value: b.slug, values: [b.slug], count: brandCount.get(b.id) ?? 0 }))
    .filter((b) => b.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "he"));

  /* Two attributes in different sub-categories can share a key — the scope
     spans a department and its children — so values are collected per key
     rather than per attribute row, and the counts add up across them. */
  const byId = new Map(attributes.map((a) => [a.id, a]));
  const optionsByKey = new Map<string, Map<string, FacetOption>>();
  for (const group of valueGroups) {
    const attr = byId.get(group.attributeId);
    if (!attr) continue;
    const label = normalizeFacetValue(group.value);
    if (!label) continue; // blank, or "לא צוין"

    const bucket = optionsByKey.get(attr.key) ?? new Map<string, FacetOption>();
    const existing = bucket.get(label);
    if (existing) {
      existing.count += group._count._all;
      // Both spellings have to reach the query, or the chip under-selects.
      if (!existing.values.includes(group.value)) existing.values.push(group.value);
    } else {
      bucket.set(label, { value: label, count: group._count._all, values: [group.value] });
    }
    optionsByKey.set(attr.key, bucket);
  }

  const filledByKey = new Map<string, number>();
  for (const group of filledCounts) {
    const attr = byId.get(group.attributeId);
    if (!attr) continue;
    filledByKey.set(attr.key, (filledByKey.get(attr.key) ?? 0) + group._count._all);
  }

  const seen = new Set<string>();
  const facets: Facet[] = [];
  for (const attr of attributes) {
    if (seen.has(attr.key)) continue;
    seen.add(attr.key);

    const bucket = optionsByKey.get(attr.key);
    if (!bucket || bucket.size < 2) continue; // one option filters nothing

    const coverage = liveTotal > 0 ? (filledByKey.get(attr.key) ?? 0) / liveTotal : 0;
    if (coverage < MIN_FACET_COVERAGE) continue;

    const options = [...bucket.values()];

    /* A numeric attribute reads as a scale and has to be ordered like one:
       "6 ק״ג, 7, 8, 9" is a list somebody can run their eye down, and the
       same values ordered by popularity are just noise. Everything else is
       ordered by how many products carry it, because that is the order in
       which they are worth trying. */
    if (attr.inputType === "number") {
      options.sort((a, b) => parseFloat(a.value) - parseFloat(b.value) || a.value.localeCompare(b.value, "he"));
    } else {
      options.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "he"));
    }

    facets.push({ key: attr.key, label: attr.label, unit: attr.unit, coverage, options });
  }

  return { brands, attributes: facets };
}

/**
 * The search behind the chat, which is a different job from the search box.
 *
 * A shopper who types "מקרר" into the search field wants a shelf. A shopper
 * who tells Alfred "אני רוצה מקרר חדש לבית" wants a conversation, and the
 * model can only hold one about what it is shown. It was being shown five
 * rows, and the way those five were picked is the whole reason this exists.
 *
 * WHAT WENT WRONG. Words were matched with OR, so "מקרר חדש לבית" also
 * matched every product whose text contains "חדש" or "לבית" — most of the
 * catalogue. The result was ordered by isBestSeller, which is false for all
 * two thousand products, so the database returned five arbitrary rows. On the
 * run a customer saw, they were an office fridge and two mini-bars, and
 * Alfred said — reasonably, given what it had — that the shop stocks office
 * fridges and mini-bars. The shop stocks 222 live fridges across nine
 * sub-categories, from ₪490 to ₪31,000.
 *
 * THREE THINGS CHANGE.
 *
 * Rows are scored by how many of the query's words they match, so a product
 * that answers the whole question outranks one that shares a stray word.
 *
 * Ties break toward the larger sub-category. A shop's biggest shelf is what
 * it mainly sells, and it is the better guess when someone says only
 * "fridge" — 58 four-door fridges before 17 office ones. Cheapest-first,
 * which is what price ordering would give, is exactly how the mini-bars won.
 *
 * The catalogue is described alongside the products. Ten rows can never
 * stand for 222, and a model handed ten will describe the ten. The breakdown
 * says what is really there — every matching sub-category, its count and its
 * price range — which is what lets Alfred ask "which kind?" instead of
 * guessing, and what stops it ever again telling a customer the shop is
 * smaller than it is.
 *
 * shortDescription travels too. Without it the model knows a title, a price
 * and a stock status, and every question about the product itself — does it
 * make ice, is it quiet, will it fit — has to be deflected to the product
 * page. 144 of those 219 fridges say something about ice in their text.
 */
export type ChatProduct = {
  title: string;
  slug: string;
  price: number;
  stockStatus: string;
  brandName: string;
  categoryName: string;
  summary: string | null;
  imageUrl: string | null;
};

export type CategorySpread = { name: string; count: number; minPrice: number; maxPrice: number };

export async function searchForChat(
  words: string[],
  opts: { limit?: number; maxPrice?: number } = {}
): Promise<{ products: ChatProduct[]; spread: CategorySpread[]; totalMatches: number }> {
  const terms = words.filter((w) => w.length >= 2).slice(0, 6);
  if (terms.length === 0) return { products: [], spread: [], totalMatches: 0 };

  const limit = opts.limit ?? 10;
  const priceCeiling = opts.maxPrice ?? null;

  /* Written as SQL because the ranking is the point and Prisma cannot
     express "how many of these words did this row match". Every term is a
     bound parameter — none of it is concatenated into the statement. */
  const like = terms.map((t) => `%${t}%`);
  const scoreSql = like
    .map(
      (_, i) =>
        `(CASE WHEN p.title ILIKE $${i + 1} OR c.name ILIKE $${i + 1} OR COALESCE(b.name,'') ILIKE $${i + 1} OR COALESCE(p.model,'') ILIKE $${i + 1} THEN 1 ELSE 0 END)`
    )
    .join(" + ");

  const priceParam = like.length + 1;
  const priceClause = priceCeiling !== null ? `AND p.price <= $${priceParam}` : "";
  const params: unknown[] = [...like];
  if (priceCeiling !== null) params.push(priceCeiling);

  const sql = `
    WITH matched AS (
      SELECT p.id, p.title, p.slug, p.price, p."stockStatus", p."shortDescription",
             COALESCE(b.name, '') AS brand_name, c.name AS category_name,
             (${scoreSql}) AS score
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      WHERE p."isPublished" AND p."stockQty" > 0
        AND EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p.id)
        ${priceClause}
    ), hits AS (
      SELECT * FROM matched WHERE score > 0
    ), sized AS (
      SELECT h.*, COUNT(*) OVER (PARTITION BY h.category_name) AS cat_size FROM hits h
    )
    SELECT s.title, s.slug, s.price, s."stockStatus", s."shortDescription",
           s.brand_name, s.category_name, s.score, s.cat_size,
           (SELECT i.url FROM "ProductImage" i WHERE i."productId" = s.id ORDER BY i."sortOrder" ASC LIMIT 1) AS image_url
    FROM sized s
    ORDER BY s.score DESC, s.cat_size DESC, s.price ASC
    LIMIT ${limit}
  `;

  const spreadSql = `
    WITH matched AS (
      SELECT p.price, c.name AS category_name,
             (${scoreSql}) AS score
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      WHERE p."isPublished" AND p."stockQty" > 0
        AND EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p.id)
        ${priceClause}
    )
    SELECT category_name, COUNT(*)::int AS count, MIN(price)::int AS min_price, MAX(price)::int AS max_price
    FROM matched WHERE score > 0
    GROUP BY category_name ORDER BY count DESC LIMIT 12
  `;

  type Row = {
    title: string;
    slug: string;
    price: number;
    stockStatus: string;
    shortDescription: string | null;
    brand_name: string;
    category_name: string;
    image_url: string | null;
  };
  type SpreadRow = { category_name: string; count: number; min_price: number; max_price: number };

  const [rows, spreadRows] = await Promise.all([
    db.$queryRawUnsafe<Row[]>(sql, ...params),
    db.$queryRawUnsafe<SpreadRow[]>(spreadSql, ...params),
  ]);

  return {
    products: rows.map((r) => ({
      title: r.title,
      slug: r.slug,
      price: Number(r.price),
      stockStatus: r.stockStatus,
      brandName: r.brand_name,
      categoryName: r.category_name,
      // Long enough to answer "does it make ice", short enough that ten of
      // them still leave the model room to think about the question.
      summary: r.shortDescription ? r.shortDescription.slice(0, 320) : null,
      imageUrl: r.image_url,
    })),
    spread: spreadRows.map((s) => ({
      name: s.category_name,
      count: Number(s.count),
      minPrice: Number(s.min_price),
      maxPrice: Number(s.max_price),
    })),
    totalMatches: spreadRows.reduce((sum, s) => sum + Number(s.count), 0),
  };
}
