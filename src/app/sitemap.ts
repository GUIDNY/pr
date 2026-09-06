import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { SITE_URL as BASE_URL } from "@/lib/site-url";

// One catalog this size (products + categories + articles) comfortably
// fits under the 50k-URL-per-file cap a sitemap.xml is allowed, so this
// stays a single file rather than the split-index pattern a bigger catalog
// would need.
//
// changeFrequency and priority are kept but do nothing: Google announced in
// 2015 that it ignores both, and has not moved since. They are harmless, and
// removing them would be churn for its own sake. lastModified is the field
// that is actually read, which is why the 99 URLs that lacked one — the
// homepage, /articles and all 97 categories — now have it.
//
// Every date here is derived from a row that really changed. A listing page
// with nothing to date is sent without a lastModified rather than with an
// invented one: no date at all is a smaller lie than today's date, and a
// sitemap that claims everything changed this morning is one Google learns
// to discount wholesale.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [products, categories, articles, brands] = await Promise.all([
    db.product.findMany({
      where: PUBLIC_PRODUCT_WHERE,
      select: { slug: true, updatedAt: true, categoryId: true, brandId: true },
    }),
    db.category.findMany({ select: { id: true, slug: true, parentId: true } }),
    db.article.findMany({ where: { isPublished: true }, select: { slug: true, updatedAt: true } }),
    db.brand.findMany({ where: { isActive: true }, select: { id: true, slug: true } }),
  ]);

  const newest = (dates: (Date | undefined)[]): Date | undefined => {
    let max: Date | undefined;
    for (const d of dates) if (d && (!max || d > max)) max = d;
    return max;
  };

  // Newest public product per category, then rolled up to parents. A category
  // page lists its own products and its direct children's — categoryScope in
  // queries/products.ts — so its date has to cover the same set, or the page
  // says it changed on a day the sitemap does not.
  const ownNewest = new Map<string, Date>();
  for (const p of products) {
    const current = ownNewest.get(p.categoryId);
    if (!current || p.updatedAt > current) ownNewest.set(p.categoryId, p.updatedAt);
  }

  const childrenOf = new Map<string, string[]>();
  for (const c of categories) {
    if (!c.parentId) continue;
    const siblings = childrenOf.get(c.parentId) ?? [];
    siblings.push(c.id);
    childrenOf.set(c.parentId, siblings);
  }

  const categoryLastModified = (id: string) =>
    newest([ownNewest.get(id), ...(childrenOf.get(id) ?? []).map((childId) => ownNewest.get(childId))]);

  // The homepage's rails are deals, best sellers and featured products, so
  // the catalog's newest change is what dates it. Not the homepage sections
  // an admin can edit — those have no timestamp to read — which is worth
  // knowing rather than pretending otherwise.
  // Brand pages were missing from this file entirely — all of them — so a
  // brand with 106 products in the shop was not offered to a single engine.
  // Dated by its own newest visible product, for the same reason categories
  // are: a page's date has to describe what the page shows.
  //
  // A brand with nothing visible is left out rather than sent without a date.
  // Unlike a category it is not part of the navigation anyone browses, so an
  // empty one is a thin page, and asking a crawler to fetch it spends the
  // crawl budget that the products need.
  const brandNewest = new Map<string, Date>();
  for (const p of products) {
    const current = brandNewest.get(p.brandId);
    if (!current || p.updatedAt > current) brandNewest.set(p.brandId, p.updatedAt);
  }

  const catalogNewest = newest(products.map((p) => p.updatedAt));
  const articlesNewest = newest(articles.map((a) => a.updatedAt));

  return [
    { url: BASE_URL, lastModified: catalogNewest, changeFrequency: "daily", priority: 1 },
    { url: `${BASE_URL}/articles`, lastModified: articlesNewest, changeFrequency: "weekly", priority: 0.6 },
    ...categories.map((c) => ({
      url: `${BASE_URL}/category/${c.slug}`,
      lastModified: categoryLastModified(c.id),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...brands
      .filter((b) => brandNewest.has(b.id))
      .map((b) => ({
        url: `${BASE_URL}/brand/${b.slug}`,
        lastModified: brandNewest.get(b.id),
        changeFrequency: "weekly" as const,
        priority: 0.6,
      })),
    ...products.map((p) => ({
      url: `${BASE_URL}/product/${p.slug}`,
      lastModified: p.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
    ...articles.map((a) => ({
      url: `${BASE_URL}/articles/${a.slug}`,
      lastModified: a.updatedAt,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
