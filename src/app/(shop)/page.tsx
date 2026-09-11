import { ShopHero } from "@/components/home/shop-hero";
import { DepartmentChips } from "@/components/home/department-chips";
import { CategoryGrid } from "@/components/home/category-grid-mobile";
import { ProductRail } from "@/components/home/product-rail";
import { BrandStrip } from "@/components/home/brand-strip";
import { WhyPrec } from "@/components/home/why-prec";
import { FinderTeaser } from "@/components/home/finder-teaser";
import {
  getDeals,
  getBestSellers,
  getFeaturedProducts,
  getProductsByIds,
  getCatalogSize,
  getNewArrivals,
  getDepartmentShowcases,
} from "@/lib/queries/products";
import { getHomepageSection, getFeaturedBrands } from "@/lib/queries/content";
import { getCategoryTilesWithImages } from "@/lib/queries/categories";
import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationSchema, webSiteSchema } from "@/lib/schema";

// Deliberately here and not in the root layout. Metadata is inherited, so a
// canonical set once at the root would be handed to every page that does not
// override it — each one announcing itself as the homepage, which is worse
// than having none at all.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// Nothing on this page differs between visitors any more — the greeting and
// the hearts fill themselves in from the browser — so it is prepared once and
// served from the edge instead of being built per request. That is the whole
// of the homepage's 2.4-second cold response: not the nine queries, but the
// fact that a server had to wake up and run them for every single caller,
// Googlebot included.
//
// Five minutes because the catalog moves when someone presses sync, not
// continuously, and a deal appearing five minutes late costs nothing next to
// what this saves on every first visit.
export const revalidate = 300;

export default async function HomePage() {
  const [hero, whyPrec, deals, bestSellers, featured, brands, categoryTiles, alfredWidget, catalog, newArrivals, showcases] =
    await Promise.all([
      getHomepageSection("hero"),
      getHomepageSection("why-prec"),
      getDeals(11),
      getBestSellers(8),
      getFeaturedProducts(4),
      getFeaturedBrands(),
      getCategoryTilesWithImages(),
      getHomepageSection("alfred-widget"),
      getCatalogSize(),
      getNewArrivals(8),
      getDepartmentShowcases({ departments: 6, perDepartment: 4 }),
    ]);

  // Admin-curated at /admin/homepage-alfred (payload.productIds). Shown as
  // an ordinary product rail, not as a chat panel in a second hero: when
  // nobody has picked anything the rail simply does not render, rather
  // than borrowing today's deals and showing them twice.
  const alfredWidgetIds = (alfredWidget?.payload as { productIds?: string[] } | undefined)?.productIds ?? [];
  const alfredPicks = alfredWidgetIds.length > 0 ? await getProductsByIds(alfredWidgetIds) : [];

  // The hero shows the first three deals; the rail gets the rest, and
  // stays off the page when there is no rest.
  const moreDeals = deals.slice(3);
  const [firstShowcases, laterShowcases] = [showcases.slice(0, 2), showcases.slice(2)];

  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={webSiteSchema()} />
      {/* The page, top to bottom, and why in this order.

          The first screen has one job: to read as a real appliance shop
          within a second — warranty, delivery, a street address, the size
          of the catalogue and three real deals with real prices (ShopHero).
          Then the breadth of what is sold, twice over: every department as
          a chip, and the manufacturers as marks, because shoppers misjudge
          what a shop sells from a narrow front page and Bosch, Samsung and
          LG say "legitimate" faster than any sentence about it.

          Then products, a department at a time — fridges, ovens,
          televisions — each row a sample of real stock with a link to the
          whole department. Not "best sellers": nothing is flagged as one
          and there is no sales history to rank by, so that rail rendered
          empty. Alfred's finder sits between the rows as a convenience
          rather than a headline, and the page closes on the shop itself:
          address, phone, the registered company.

          Same order at every width; nothing rotates on its own. */}
      <ShopHero
        title={hero?.title || "מוצרי חשמל מיבואן רשמי, במחיר טוב"}
        subtitle={hero?.subtitle || "משלוח עד הבית, אחריות יבואן רשמי ושירות לקוחות אמיתי"}
        ctaLabel={hero ? (hero.payload as { ctaLabel: string }).ctaLabel : undefined}
        ctaHref={hero ? (hero.payload as { ctaHref: string }).ctaHref : undefined}
        showcase={deals}
        productCount={catalog.products}
        brandCount={catalog.brands}
      />

      <DepartmentChips />

      <BrandStrip brands={brands} />

      {moreDeals.length > 0 && (
        <ProductRail title="מבצעים חמים" subtitle="הנחות לזמן מוגבל" products={moreDeals} viewAllHref="/deals" />
      )}

      {firstShowcases.map((d) => (
        <ProductRail
          key={d.slug}
          title={d.name}
          subtitle={`${d.count.toLocaleString("he-IL")} מוצרים במלאי`}
          products={d.products}
          viewAllHref={`/category/${d.slug}`}
          viewAllLabel={`לכל ${d.name}`}
        />
      ))}

      <CategoryGrid tiles={categoryTiles} />

      {laterShowcases.slice(0, 2).map((d) => (
        <ProductRail
          key={d.slug}
          title={d.name}
          subtitle={`${d.count.toLocaleString("he-IL")} מוצרים במלאי`}
          products={d.products}
          viewAllHref={`/category/${d.slug}`}
          viewAllLabel={`לכל ${d.name}`}
        />
      ))}

      <FinderTeaser />

      {laterShowcases.slice(2).map((d) => (
        <ProductRail
          key={d.slug}
          title={d.name}
          subtitle={`${d.count.toLocaleString("he-IL")} מוצרים במלאי`}
          products={d.products}
          viewAllHref={`/category/${d.slug}`}
          viewAllLabel={`לכל ${d.name}`}
        />
      ))}

      <ProductRail title="חדש בקטלוג" subtitle="הגיעו אלינו לאחרונה" products={newArrivals} />

      {alfredPicks.length > 0 && (
        <ProductRail title="אלפרד ממליץ" subtitle="הבחירות של העוזר החכם שלנו להיום" products={alfredPicks} />
      )}

      {bestSellers.length > 0 && <ProductRail title="הנמכרים ביותר" products={bestSellers} />}

      {featured.length > 0 && <ProductRail title="מומלצים במיוחד" products={featured} />}

      {whyPrec && (
        <WhyPrec
          title={whyPrec.title ?? ""}
          items={whyPrec.payload as { title: string; body: string }[]}
        />
      )}
    </>
  );
}
