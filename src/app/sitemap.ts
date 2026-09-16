import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL as BASE_URL } from "@/lib/site-url";
import { hasDerivedHashSuffix } from "@/lib/derived-slug";
import { RETURNS_POLICY_UPDATED } from "@/lib/returns-policy";

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
  const [products, categories, allProducts, articles, brands] = await Promise.all([
    // Not PUBLIC_PRODUCT_WHERE: that requires stock, and a sold-out product
    // still has a page. Since it answers 200, its URL belongs here — dropping
    // it is how the URL leaves Google's index and comes back with nothing.
    // The two content conditions stay, because a product with no photograph
    // or no publish flag really does 404.
    db.product.findMany({
      where: { isPublished: true, images: { some: {} } },
      select: { slug: true, updatedAt: true, categoryId: true, brandId: true },
    }),
    db.category.findMany({ select: { id: true, slug: true, parentId: true } }),
    // Every product, visible or not, only to date the categories that have
    // nothing on the site yet. A category holding six unpublished products
    // still changed on the day one of them did, and that is a real date off a
    // real row — better than no date, and better than inventing today's.
    db.product.findMany({ select: { updatedAt: true, categoryId: true } }),
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

  // The same rollup over every product, used only where the public one comes
  // back empty — see the fallback in categoryLastModified.
  const anyNewest = new Map<string, Date>();
  for (const p of allProducts) {
    const current = anyNewest.get(p.categoryId);
    if (!current || p.updatedAt > current) anyNewest.set(p.categoryId, p.updatedAt);
  }

  const scopeOf = (id: string) => [id, ...(childrenOf.get(id) ?? [])];

  const categoryLastModified = (id: string) =>
    newest(scopeOf(id).map((cid) => ownNewest.get(cid))) ??
    newest(scopeOf(id).map((cid) => anyNewest.get(cid)));

  /* A category is advertised when it has something a visitor can actually
     buy — not when it has rows.

     This used to ask whether the category had any product at all, hidden
     ones included, and the gap between those two questions was six
     categories: אביזרי AV with ten products, מתקנים לרמקולים with seven,
     מיקרופונים with six, and three more. Every one of those products is
     unphotographed or out of stock, so all six were offered to Google as
     pages with an empty grid on them.

     ownNewest is the visible-product map — published, photographed — and
     it already rolls up to parents, so a department still qualifies on its
     children's stock. anyNewest stays for dating: a category that drops
     out of the sitemap today keeps a real date from a real row for when it
     comes back, which is better than inventing one.

     The page itself also carries noindex while it is empty; see its
     generateMetadata. Two mechanisms because they answer different
     crawlers: this one stops the page being offered, that one stops it
     being kept if it was found some other way. */
  const hasSomethingToSell = (id: string) => scopeOf(id).some((cid) => ownNewest.has(cid));

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
    // Both were missing entirely. /brands links to every brand page, and
    // /returns is what Merchant Center checks for before approving a product.
    { url: `${BASE_URL}/brands`, lastModified: catalogNewest, changeFrequency: "weekly", priority: 0.6 },
    {
      url: `${BASE_URL}/returns`,
      lastModified: RETURNS_POLICY_UPDATED,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    /* The other two policies, which were never offered. /returns was here
       alone because Merchant Center looks for it by name — but a shop's
       terms and its privacy policy are the pages a person checks before
       handing over a card, and both existed at two addresses until this
       commit, which is its own reason to name the surviving one here
       explicitly rather than leave an engine to pick. */
    {
      url: `${BASE_URL}/terms`,
      lastModified: RETURNS_POLICY_UPDATED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/privacy`,
      lastModified: RETURNS_POLICY_UPDATED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${BASE_URL}/accessibility`,
      lastModified: RETURNS_POLICY_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    ...categories.filter((c) => hasSomethingToSell(c.id)).map((c) => ({
      url: `${BASE_URL}/category/${c.slug}`,
      lastModified: categoryLastModified(c.id),
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...brands
      // A brand still on an importer-generated address is left out until it
      // has a real one. 108 of the 147 are, and offering an address we are
      // about to redirect is worse than offering nothing: the crawl budget is
      // spent twice and Google holds both versions for weeks afterwards. This
      // is a condition, not a wait — each one appears the moment it is named.
      .filter((b) => brandNewest.has(b.id) && !hasDerivedHashSuffix(b.slug))
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
