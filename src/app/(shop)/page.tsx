import { HeroBand } from "@/components/home/hero-band";
import { UspBar } from "@/components/home/usp-bar";
import { CategoryGrid } from "@/components/home/category-grid-mobile";
import { ProductRail } from "@/components/home/product-rail";
import { BrandStrip } from "@/components/home/brand-strip";
import { WhyPrec } from "@/components/home/why-prec";
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
import { getCategoryTilesWithImages, getDepartmentCounts } from "@/lib/queries/categories";
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
  const [
    hero,
    whyPrec,
    deals,
    bestSellers,
    featured,
    brands,
    categoryTiles,
    alfredWidget,
    catalog,
    newArrivals,
    showcases,
    departmentCounts,
  ] = await Promise.all([
      getHomepageSection("hero"),
      getHomepageSection("why-prec"),
      getDeals(8),
      getBestSellers(8),
      getFeaturedProducts(4),
      getFeaturedBrands(),
      getCategoryTilesWithImages(),
      getHomepageSection("alfred-widget"),
      getCatalogSize(),
      getNewArrivals(8),
      getDepartmentShowcases({ departments: 8, perDepartment: 6 }),
      getDepartmentCounts(),
    ]);

  // Admin-curated at /admin/homepage-alfred (payload.productIds). Shown as
  // an ordinary product rail, not as a chat panel in a second hero: when
  // nobody has picked anything the rail simply does not render, rather
  // than borrowing today's deals and showing them twice.
  const alfredWidgetIds = (alfredWidget?.payload as { productIds?: string[] } | undefined)?.productIds ?? [];
  const alfredPicks = alfredWidgetIds.length > 0 ? await getProductsByIds(alfredWidgetIds) : [];

  // The banner's picture: the four-door fridge tile's photograph, which
  // the sampler chose to look like the thing; failing that, a television.
  const feature =
    categoryTiles.find((t) => t.slug === "fridge-4-door") ?? categoryTiles.find((t) => t.slug === "tvs") ?? null;
  const [firstShowcases, laterShowcases] = [showcases.slice(0, 2), showcases.slice(2)];

  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={webSiteSchema()} />
      {/* The page, top to bottom, and why in this order.

          The first screen is laid out like a shop, not a landing page: the
          department menu down one side with a live count beside each
          line, the banner beside it with the facts a doubtful visitor
          checks (importer warranty, catalogue size, a street in Hadera),
          Alfred's search bar, and a real product on a card; then two
          tiles — today's deals and the finder. A row of the same facts
          with icons, and the manufacturers' marks, follow before the first
          product, because Bosch, Samsung and LG say "legitimate" faster
          than any sentence about it.

          Then products, a department at a time — fridges, ovens,
          televisions — each a row of real stock with prices and a link to
          the whole department, biggest first. Not "best sellers": nothing
          is flagged as one and there is no sales history to rank by, so
          that rail rendered empty. The page closes on the shop itself:
          address, phone, the registered company.

          Same order at every width; nothing rotates on its own. */}
      <HeroBand
        title={hero?.title || "מוצרי חשמל מיבואן רשמי, במחיר טוב"}
        subtitle={hero?.subtitle || "משלוח עד הבית, אחריות יבואן רשמי ושירות לקוחות אמיתי"}
        ctaLabel={hero ? (hero.payload as { ctaLabel: string }).ctaLabel : undefined}
        ctaHref={hero ? (hero.payload as { ctaHref: string }).ctaHref : undefined}
        departments={departmentCounts}
        categoryTiles={categoryTiles}
        featureImage={feature?.imageUrl ?? null}
        featureLabel={feature?.name ?? null}
        deals={deals}
        productCount={catalog.products}
        brandCount={catalog.brands}
      />

      <UspBar />

      <BrandStrip brands={brands} />

      <ProductRail title="מבצעים חמים" subtitle="הנחות לזמן מוגבל" products={deals} viewAllHref="/deals" />

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

      {laterShowcases.map((d) => (
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
