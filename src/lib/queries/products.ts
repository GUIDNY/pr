import "server-only";
import { cache } from "react";
import { normalizeFacetValue } from "@/lib/facet-value";
import { db } from "@/lib/db";
import { colorInTitle } from "@/lib/catalog/variant-colors";
import type { ProductCardData } from "@/components/product/product-card";
import type { StockStatus } from "@/lib/enums";
import { parseShoppingQuery, splitSearchWords } from "@/lib/shopping-query";
import { resolveIntent } from "@/lib/alfred/intent";

/**
 * Exactly what a product card renders, and nothing else.
 *
 * This was an `include`, which in Prisma means "every column of Product,
 * plus these relations". A card shows a title, a price, a thumbnail and a
 * brand — 232 bytes of a row — and the query was fetching 8,559: the
 * 3.2 KB of description HTML that belongs to the product page, extraSpecsRaw,
 * seoDesc, internalNotes, stockBreakdown, the supplier columns. Thirty-seven
 * times more than reaches the screen, measured over the live catalogue.
 *
 * Nobody would have seen it from the types. ProductWithRelations below was
 * already written as the narrow shape, so TypeScript described a 232-byte
 * row while the database was asked for all of it. The type was right and
 * the query was wrong, and only the wire knew.
 *
 * That matters here more than it usually would, because Supabase bills
 * egress and a category page is twenty-four of these at once: 738 category
 * renders a day is roughly 150 MB of rows that nothing reads, which is the
 * order of the whole 5 GB monthly quota that got this project's storage
 * restricted.
 *
 * Keep it in step with ProductWithRelations. Adding a field to the type
 * without adding it here fails to compile, which is the guard.
 */
const cardSelect = {
  id: true,
  sku: true,
  slug: true,
  title: true,
  price: true,
  compareAtPrice: true,
  installmentMonths: true,
  stockStatus: true,
  ratingAvg: true,
  ratingCount: true,
  deliveryDays: true,
  brand: { select: { name: true } },
  category: { select: { icon: true, parent: { select: { icon: true } } } },
  images: { select: { url: true }, take: 1, orderBy: { sortOrder: "asc" as const } },
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
//  - stockStatus is not NEEDS_REVIEW: see below.
//
// These are query-time gates rather than an isPublished flip on purpose: a
// product returns to the site the moment it has stock and a photo, with no
// sync run in between, and isPublished keeps meaning what it says — that a
// person or the sync deliberately hid this — instead of being overloaded
// with "and also it happens to be missing content right now".
//
// NEEDS_REVIEW IS NOT A THING TO SAY TO A CUSTOMER. It means "the inventory
// data is inconsistent or unmatched and a human has to look" — the sync
// sets it when a product vanishes from the supplier sheet, and when it
// does, on line 880 of sync.ts, it does not unpublish. So 21 published,
// photographed, in-stock products were on the live site wearing
// STOCK_STATUS_LABELS.NEEDS_REVIEW, which renders as a red "דורש בדיקה"
// pill on the card and the product page. Customers were reading an
// engineer's note to himself.
//
// Worse than the wording: purchase-panel.tsx disables the button for
// OUT_OF_STOCK and DISPLAY_ONLY and for nothing else, so Add to Cart was
// live on products whose stock we had explicitly flagged as not to be
// trusted. Somebody could have bought one.
//
// The feed already had this right — google-merchant.ts leaves NEEDS_REVIEW
// out and says why: "nobody has promised [it] can actually be bought
// today". The shop is supposed to be the same predicate as the feed, and
// here it was not. This is that correction, in the constant every
// customer-facing query already spreads.
/**
 * How many sellable products a listing page needs before it is worth a
 * crawler's time.
 *
 * Two is the line: a page showing one or two products says almost nothing
 * its product pages do not say better, and it competes with them for the
 * same query. Of 218 brand and category pages, 111 hold fewer than six —
 * and 1,637 pages on this site are already "crawled, not indexed", which
 * is Google having looked at a page with one product on it and decided
 * there was no reason to keep it. Pages like that do not merely fail to
 * rank; in bulk they teach Google that this domain manufactures empty
 * pages, and that costs the pages that deserve to rank.
 *
 * One number, read in two places that answer different crawlers:
 * sitemap.ts stops offering the page, and the category and brand pages
 * put noindex on it. Offering a page you have told Google not to index is
 * the contradiction that started this; a single constant is what stops
 * the two drifting apart again.
 *
 * Reversible on its own, like every other gate here: the page comes back
 * the moment it has a third product in stock, with no list for anyone to
 * remember to edit.
 */
export const LISTING_MIN_PRODUCTS = 3;

export const PUBLIC_PRODUCT_WHERE = {
  isPublished: true,
  stockQty: { gt: 0 },
  images: { some: {} },
  stockStatus: { not: "NEEDS_REVIEW" },
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
    select: cardSelect,
    take,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapProductToCard);
}

export async function getBestSellers(take = 8) {
  const rows = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, isBestSeller: true },
    select: cardSelect,
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
    select: cardSelect,
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
        select: cardSelect,
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
    select: cardSelect,
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
    select: cardSelect,
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
      select: cardSelect,
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

export type ColorVariant = {
  slug: string;
  color: string;
  price: number;
  imageUrl: string | null;
  isCurrent: boolean;
  /** Whether `color` is a real colour this product stated, rather than the
      placeholder used when neither colorName nor the title names one. */
  named: boolean;
};

/**
 * The other finishes of the appliance on this page.
 *
 * Reads Product.variantGroupId and nothing else — no matching on titles at
 * read time. The grouping is a decision taken once, by
 * scripts/group-color-variants.ts against a rule that refuses anything
 * ambiguous; a page that re-derived it would be free to disagree with the
 * script, and the disagreement would be invisible until a customer ordered
 * the wrong colour.
 *
 * Gated on PUBLIC_PRODUCT_WHERE like every other customer-facing query. A
 * finish that is out of stock or has no photograph is not offered at all,
 * which is this shop's rule for a product anywhere else on the site and has
 * no reason to change because the product is small and round. The picker is
 * navigation: each colour is its own product with its own URL, price, stock
 * and photographs, and choosing one goes there.
 *
 * The current product is always included and always marked, even when it
 * fails that gate — an admin previewing an unpublished product, or a page
 * still reachable while sold out, should see which swatch it is looking at
 * rather than a row of colours with none of them selected.
 */
/**
 * What a swatch is called.
 *
 * colorName first: it is the structured field, it is what an admin edits,
 * and a person who has written "נירוסטה מושחרת" there has said something
 * the title may not. The title is the fallback because the supplier sheets
 * have no colour column, so that field is empty on most of the catalogue
 * and the answer really is sitting in the name.
 *
 * Never the whole title. An earlier version fell back to it, which on a
 * product whose title names no colour put a sixty-character sentence into
 * a 64px chip. A swatch that cannot be named is named by its position —
 * still a choice a shopper can make, because the picture beside it is the
 * actual answer.
 */
function swatchOf(
  p: { slug: string; title: string; colorName: string | null; price: number },
  fallback: string
): { slug: string; color: string; price: number; named: boolean } {
  const given = p.colorName?.trim();
  const color = (given && given.length > 0 ? given : colorInTitle(p.title)) ?? null;
  return { slug: p.slug, color: color ?? fallback, price: p.price, named: color !== null };
}

export async function getColorVariants(product: {
  id: string;
  slug: string;
  title: string;
  colorName: string | null;
  price: number;
  variantGroupId: string | null;
  images: { url: string }[];
}): Promise<ColorVariant[]> {
  if (!product.variantGroupId) return [];

  const siblings = await db.product.findMany({
    where: {
      ...PUBLIC_PRODUCT_WHERE,
      variantGroupId: product.variantGroupId,
      id: { not: product.id },
    },
    select: {
      slug: true,
      title: true,
      colorName: true,
      price: true,
      images: { orderBy: { sortOrder: "asc" }, take: 1, select: { url: true } },
    },
    orderBy: { price: "asc" },
  });

  /* A photograph is only shown for a colour that has its own.
    
     Three of the eighteen groups share one picture across both finishes —
     the LaCasa microwave, the DAVO mixer, the Hyundai hob — because the
     sheet gave the pair a single image and nobody has photographed the
     second colour yet. That is already wrong on those product pages, and
     it was wrong before this picker existed. What the picker must not do
     is launder it: a photo of a black microwave under a swatch labelled
     לבן is not a display bug, it is the shop stating in a picture that
     this is what will arrive.
    
     So a duplicate picture is dropped rather than repeated, and the colour
     is offered by name alone. The shopper still learns the finish exists
     and can still reach it; they are just not shown a photograph of a
     different one. The fix for the underlying gap is a photograph, and it
     belongs to whoever takes them. */
  const currentImage = product.images[0]?.url ?? null;

  const rows: ColorVariant[] = [
    { ...swatchOf(product, "הגוון הנוכחי"), imageUrl: currentImage, isCurrent: true },
    ...siblings.map((s) => {
      const url = s.images[0]?.url ?? null;
      return {
        ...swatchOf(s, "גוון אחר"),
        imageUrl: url && url !== currentImage ? url : null,
        isCurrent: false,
      };
    }),
  ];

  /* One swatch per colour. A group can legitimately hold two live rows of
     the same finish — the catalogue has a white AL-65 under two SKUs — and
     two identical swatches side by side is a shopper being asked to choose
     between the same thing twice. The current product wins its own colour;
     otherwise the cheaper one does, which is the order they arrive in. */
  const seen = new Set<string>();
  const unique = rows.filter((r) => {
    /* Only a colour that was actually named can prove two swatches are the
       same colour. Two unnamed finishes both fall back to the same
       placeholder, and collapsing on that would silently hide one real
       variant behind another — the opposite of the duplicate this is here
       to remove. */
    if (!r.named) return true;
    if (seen.has(r.color)) return false;
    seen.add(r.color);
    return true;
  });

  // One colour is not a choice.
  return unique.length > 1 ? unique : [];
}

export async function getRelatedProducts(categoryId: string, excludeId: string, take = 4) {
  const rows = await db.product.findMany({
    where: { ...PUBLIC_PRODUCT_WHERE, categoryId, id: { not: excludeId } },
    select: cardSelect,
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
    db.product.findMany({ where, select: cardSelect, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
    db.product.count({ where }),
  ]);

  return { products: rows.map(mapProductToCard), total, brand };
}

/**
 * How search ranks, in one place, returning ids in order.
 *
 * It used to OR every word against every field and take the first 8 rows
 * with no ORDER BY at all. Both halves of that are wrong, and together they
 * produced the failure that was actually reported: typing "מכונת כביסה"
 * returned DeLonghi coffee machines.
 *
 * The OR is why they qualified — "מכונת קפה" contains "מכונת", so a coffee
 * machine matches a search for a washing machine on one word out of two. On
 * the live catalogue that turns 71 real matches into 121, of which 10 are
 * coffee machines.
 *
 * The missing ORDER BY is why they came first. Without one the database is
 * free to return any 8 of the 121 in any order, so the same query answers
 * differently depending on the plan — which is why this reads as
 * intermittent rather than broken, and why running the same predicate by
 * hand returned washing machines while the site returned coffee.
 *
 * Both are fixed by ranking rather than by filtering harder. A strict AND
 * across words would also keep the coffee machines out, and would answer
 * "מכונת כביסה 8 קילו" with nothing at all, because "קילו" appears in no
 * title — an empty box for a query that is *more* specific, which is the
 * worst way to fail. Scoring keeps every candidate and lets the full
 * matches take the slots: with 71 products matching both words, a one-word
 * match never reaches the first page.
 *
 *   score = 10 × (words matched anywhere) + (words matched in the title)
 *
 * The first term makes "matched more of what you typed" dominate; the
 * second breaks ties toward the product whose own name says it, so a
 * washing machine beats an accessory that merely sits in the washing
 * machine category.
 *
 * SQL because the ranking is the point and Prisma cannot express "how many
 * of these words did this row match" — the same reason searchForChat is
 * written this way. Every term is a bound parameter; nothing is
 * concatenated into the statement.
 *
 * Ids rather than rows, and exported, because there are two callers that
 * need different shapes: searchProducts below builds cards, and
 * searchProductsAction builds the header dropdown's own row type. Those two
 * were separate copies of the same broken query, and fixing one left the
 * other wrong — the search box on the homepage kept returning coffee
 * machines after /search had stopped. One ranker means a third copy cannot
 * quietly disagree with these two.
 */
export async function rankedSearchIds(query: string, take: number): Promise<string[]> {
  if (!query.trim()) return [];
  const { text, maxPrice } = parseShoppingQuery(query);
  const words = splitSearchWords(text).slice(0, 6);
  if (words.length === 0) return [];

  const like = words.map((w) => `%${w}%`);
  const anyField = like
    .map(
      (_, i) =>
        `(CASE WHEN p.title ILIKE $${i + 1} OR p.sku ILIKE $${i + 1} OR COALESCE(p.model,'') ILIKE $${i + 1}` +
        ` OR COALESCE(b.name,'') ILIKE $${i + 1} OR c.name ILIKE $${i + 1} THEN 1 ELSE 0 END)`,
    )
    .join(" + ");
  const titleOnly = like
    .map((_, i) => `(CASE WHEN p.title ILIKE $${i + 1} THEN 1 ELSE 0 END)`)
    .join(" + ");
  const params: unknown[] = [...like];

  /* The shelf the words name comes first.
     "מקרן" is in the title of every soundbar (מקרן קול) and every patio
     heater (מקרן חום), and with every field scored alike the two
     projectors tied with eleven soundbars and lost on price. A substring
     on the category name cannot break that tie either: the category is
     "מקרנים", with a plain nun, and the word ends in a final one. So the
     same resolver Alfred uses reads the query (lib/alfred/intent.ts —
     stems, prefixes, synonyms, longest phrase wins), and every row on the
     shelf it names outranks every row that merely mentions the word. */
  const intentSlugs = resolveIntent({ userMessages: [query] }).categorySlugs;
  let shelfScore = "0";
  if (intentSlugs.length > 0) {
    const list = intentSlugs.map((slug) => {
      params.push(slug);
      return `$${params.length}`;
    });
    shelfScore = `(CASE WHEN c.slug IN (${list.join(", ")}) OR pc.slug IN (${list.join(", ")}) THEN 50 ELSE 0 END)`;
  }

  let priceClause = "";
  if (maxPrice !== null) {
    params.push(maxPrice);
    priceClause = `AND p.price <= $${params.length}`;
  }
  params.push(take);
  const limitParam = params.length;

  const rows = await db.$queryRawUnsafe<{ id: string }[]>(
    `
    WITH scored AS (
      SELECT p.id,
             ${shelfScore} + (${anyField}) * 10 + (${titleOnly}) AS score,
             p."isBestSeller" AS best,
             p.price AS price
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Category" pc ON pc.id = c."parentId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      -- PUBLIC_PRODUCT_WHERE, by hand. This is raw SQL, so the constant
      -- cannot be spread here, and that is exactly how the NEEDS_REVIEW
      -- condition went missing from search while every Prisma query picked
      -- it up for free. Any change to that constant has to be copied into
      -- all three of these blocks; there is no compiler to notice.
      WHERE p."isPublished" AND p."stockQty" > 0
        AND p."stockStatus" <> 'NEEDS_REVIEW'
        AND EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p.id)
        ${priceClause}
    )
    SELECT id FROM scored
    WHERE score > 0
    ORDER BY score DESC, best DESC, price ASC, id ASC
    LIMIT $${limitParam}
    `,
    ...params,
  );
  return rows.map((r) => r.id);
}

/** Restore the ranker's order — findMany does not preserve an `in` list. */
export function inRankedOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [row] : [];
  });
}

/** The /search results page. */
export async function searchProducts(query: string, take = 8) {
  const ids = await rankedSearchIds(query, take);
  if (ids.length === 0) return [];
  /* The gate again, even though rankedSearchIds already applied it. The
     ranker hand-rolls the predicate in raw SQL — it cannot spread the
     constant — so the two can drift, and this is the cheap place to make
     drift harmless rather than invisible. */
  const products = await db.product.findMany({
    where: { id: { in: ids }, ...PUBLIC_PRODUCT_WHERE },
    select: cardSelect,
  });
  return inRankedOrder(ids, products).map(mapProductToCard);
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
  /** The manufacturer's code. What the model writes when it names a product,
      and therefore how the reply is matched back to a card. */
  model: string | null;
  price: number;
  stockStatus: string;
  brandName: string;
  categoryName: string;
  summary: string | null;
  imageUrl: string | null;
};

export type CategorySpread = { name: string; count: number; minPrice: number; maxPrice: number };

export type ChatSearchOptions = {
  limit?: number;
  maxPrice?: number;
  /** Leaf category slugs to stay inside. With this set the words may be
      empty — "the cheapest fridge" has no scoring word left once "fridge"
      has become the category, and the shelf itself is the answer. */
  categorySlugs?: string[];
  /** Brand names exactly as stored on Brand rows. */
  brandNames?: string[];
  sort?: "cheapest" | "priciest" | "popular";
};

export async function searchForChat(
  words: string[],
  opts: ChatSearchOptions = {}
): Promise<{ products: ChatProduct[]; spread: CategorySpread[]; totalMatches: number }> {
  const terms = words.filter((w) => w.length >= 2).slice(0, 6);
  const categorySlugs = (opts.categorySlugs ?? []).slice(0, 40);
  const brandNames = (opts.brandNames ?? []).slice(0, 10);
  if (terms.length === 0 && categorySlugs.length === 0 && brandNames.length === 0) {
    return { products: [], spread: [], totalMatches: 0 };
  }

  const limit = Math.max(1, Math.min(opts.limit ?? 10, 20));
  const priceCeiling = opts.maxPrice ?? null;

  /* Written as SQL because the ranking is the point and Prisma cannot
     express "how many of these words did this row match". Every term,
     slug, brand and price is a bound parameter — none of it is
     concatenated into the statement. */
  const params: unknown[] = [];
  const bind = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };

  const wordScore =
    terms.length > 0
      ? terms
          .map((t) => {
            const ph = bind(`%${t}%`);
            return `(CASE WHEN p.title ILIKE ${ph} OR c.name ILIKE ${ph} OR COALESCE(b.name,'') ILIKE ${ph} OR COALESCE(p.model,'') ILIKE ${ph} THEN 1 ELSE 0 END)`;
          })
          .join(" + ")
      : "0";
  /* Inside a resolved category every row is a hit, and the words only
     rank them. Outside one, a row has to match a word to count at all —
     that is what keeps "what are your delivery times" from returning a
     shaver. */
  const scoreSql = categorySlugs.length > 0 || brandNames.length > 0 ? `(${wordScore}) + 1` : `(${wordScore})`;

  const clauses: string[] = [];
  if (categorySlugs.length > 0) {
    const list = categorySlugs.map((s) => bind(s)).join(", ");
    clauses.push(`AND (c.slug IN (${list}) OR pc.slug IN (${list}))`);
  }
  if (brandNames.length > 0) {
    clauses.push(`AND b.name IN (${brandNames.map((n) => bind(n)).join(", ")})`);
  }
  if (priceCeiling !== null) clauses.push(`AND p.price <= ${bind(priceCeiling)}`);
  const extraWhere = clauses.join("\n        ");

  const orderBy =
    opts.sort === "cheapest"
      ? "s.price ASC, s.score DESC"
      : opts.sort === "priciest"
        ? "s.price DESC, s.score DESC"
        : opts.sort === "popular"
          ? "s.best DESC, s.score DESC, s.cat_size DESC, s.price ASC"
          : "s.score DESC, s.cat_size DESC, s.best DESC, s.price ASC";

  const matchedCte = `
    WITH matched AS (
      SELECT p.id, p.title, p.slug, p.price, p."stockStatus", p."shortDescription", p.model,
             p."isBestSeller" AS best,
             COALESCE(b.name, '') AS brand_name, c.name AS category_name,
             ${scoreSql} AS score
      FROM "Product" p
      JOIN "Category" c ON c.id = p."categoryId"
      LEFT JOIN "Category" pc ON pc.id = c."parentId"
      LEFT JOIN "Brand" b ON b.id = p."brandId"
      -- PUBLIC_PRODUCT_WHERE, by hand. This is raw SQL, so the constant
      -- cannot be spread here, and that is exactly how the NEEDS_REVIEW
      -- condition went missing from search while every Prisma query picked
      -- it up for free. Any change to that constant has to be copied into
      -- all three of these blocks; there is no compiler to notice.
      WHERE p."isPublished" AND p."stockQty" > 0
        AND p."stockStatus" <> 'NEEDS_REVIEW'
        AND EXISTS (SELECT 1 FROM "ProductImage" i WHERE i."productId" = p.id)
        ${extraWhere}
    )`;

  const sql = `${matchedCte}, hits AS (
      SELECT * FROM matched WHERE score > 0
    ), sized AS (
      SELECT h.*, COUNT(*) OVER (PARTITION BY h.category_name) AS cat_size FROM hits h
    )
    SELECT s.title, s.slug, s.price, s."stockStatus", s."shortDescription", s.model,
           s.brand_name, s.category_name, s.score, s.cat_size,
           (SELECT i.url FROM "ProductImage" i WHERE i."productId" = s.id ORDER BY i."sortOrder" ASC LIMIT 1) AS image_url
    FROM sized s
    ORDER BY ${orderBy}
    LIMIT ${limit}
  `;

  const spreadSql = `${matchedCte}
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
    model: string | null;
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
      model: r.model,
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
