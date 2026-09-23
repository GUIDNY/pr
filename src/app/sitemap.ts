import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { SITE_URL as BASE_URL } from "@/lib/site-url";
import { hasDerivedHashSuffix } from "@/lib/derived-slug";
import { RETURNS_POLICY_UPDATED } from "@/lib/returns-policy";
import { SHIPPING_POLICY_UPDATED } from "@/lib/shipping-policy";
import { TERMS_UPDATED } from "@/lib/content/terms";

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
      // stockQty is read but not filtered on: the product URLs below still
      // want the sold-out ones, and the category gate further down wants
      // only the sellable ones. One query, two rollups.
      select: { slug: true, updatedAt: true, categoryId: true, brandId: true, stockQty: true },
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

  /* The sellable rollup, which is a different question from the one above,
     and a count rather than a date because the gate below needs to know how
     many, not when.

     ownNewest deliberately includes sold-out products, because a sold-out
     product still has a page that answers 200 and its URL belongs in this
     file. A category page is not like that: it renders the public
     predicate, stock included, so a category whose every product is out of
     stock shows an empty grid however well photographed they are.

     Gating the categories on ownNewest was not enough for exactly that
     reason — four of the six empty categories are published and
     photographed and simply have nothing on the shelf, so they stayed
     advertised while their own pages had already started saying noindex.
     The sitemap and the page were telling Google opposite things. */
  const sellableCount = new Map<string, number>();
  for (const p of products) {
    if (p.stockQty <= 0) continue;
    sellableCount.set(p.categoryId, (sellableCount.get(p.categoryId) ?? 0) + 1);
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
  const sellableInScope = (id: string) =>
    scopeOf(id).reduce((sum, cid) => sum + (sellableCount.get(cid) ?? 0), 0);

  /* How many products a listing page needs before it is worth a crawl.
     Two is the line: a page showing one or two products says almost
     nothing the product pages do not say better, and it competes with them
     for the same query. 55 brand pages and 13 category pages are under it.

     Offered, not indexed — this file is a set of suggestions. Nothing here
     adds noindex and nothing stops a crawler reaching these pages through
     the menu, which is exactly the point: they stay part of the site and
     stop being advertised as destinations. A page crosses back the moment
     it has a third product in stock.

     The number is one constant rather than two because a thin brand page
     and a thin category page are thin for the same reason, and a threshold
     that lives in two places is one that ends up meaning two things. */
  const LISTING_MIN_PRODUCTS = 3;

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
  //
  // Sellable, not merely published — the same correction the categories got
  // above, and it was still owed here. This map was built off `products`,
  // which is published-and-photographed without the stock condition, while
  // the brand page renders PUBLIC_PRODUCT_WHERE. Ten brands sat in the gap:
  // DLX, HAMA, JAMO, Lexus, Proficient, ProView, Sanyo Aqua Fresh, SIH,
  // Sirius Living and לא ידוע were offered to Google as pages that then
  // answered with an empty grid and a noindex of their own. The sitemap and
  // the page were contradicting each other, which is the one thing a sitemap
  // must never do.
  //
  // Dating off the sellable rows rather than all of them is right for the
  // same reason: a sold-out product is not on this page, so a change to it
  // is not a change to this page. A brand that drops out needs no date to
  // keep, since it leaves the file entirely and returns the moment it has
  // stock again.
  const brandNewest = new Map<string, Date>();
  const brandSellableCount = new Map<string, number>();
  for (const p of products) {
    if (p.stockQty <= 0) continue;
    const current = brandNewest.get(p.brandId);
    if (!current || p.updatedAt > current) brandNewest.set(p.brandId, p.updatedAt);
    brandSellableCount.set(p.brandId, (brandSellableCount.get(p.brandId) ?? 0) + 1);
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
      url: `${BASE_URL}/shipping`,
      lastModified: SHIPPING_POLICY_UPDATED,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${BASE_URL}/terms`,
      // Its own date. This was RETURNS_POLICY_UPDATED, so revising the terms
      // told a crawler nothing had changed.
      lastModified: TERMS_UPDATED,
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
    ...categories
      .filter((c) => sellableInScope(c.id) >= LISTING_MIN_PRODUCTS)
      .map((c) => ({
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
      .filter(
        (b) =>
          (brandSellableCount.get(b.id) ?? 0) >= LISTING_MIN_PRODUCTS && !hasDerivedHashSuffix(b.slug),
      )
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
