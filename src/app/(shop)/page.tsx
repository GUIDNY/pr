import { AlfredSection } from "@/components/home/alfred-section";
import { CategoryExplorer } from "@/components/home/category-explorer";
import { CategoryGrid } from "@/components/home/category-grid-mobile";
import { ProductRail } from "@/components/home/product-rail";
import { BrandStrip } from "@/components/home/brand-strip";
import { WhyPrec } from "@/components/home/why-prec";
import { FinderTeaser } from "@/components/home/finder-teaser";
import { getDeals, getBestSellers, getFeaturedProducts, getProductsByIds } from "@/lib/queries/products";
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
  const [hero, whyPrec, deals, bestSellers, featured, brands, categoryTiles, alfredWidget] =
    await Promise.all([
      getHomepageSection("hero"),
      getHomepageSection("why-prec"),
      getDeals(8),
      getBestSellers(8),
      getFeaturedProducts(4),
      getFeaturedBrands(),
      getCategoryTilesWithImages(),
      getHomepageSection("alfred-widget"),
    ]);

  // Admin-curated at /admin/homepage-alfred (payload.productIds). Shown as
  // an ordinary product rail further down the page, not as a chat panel in
  // a second hero: when nobody has picked anything the rail simply does not
  // render, rather than borrowing today's deals and showing them twice.
  const alfredWidgetIds = (alfredWidget?.payload as { productIds?: string[] } | undefined)?.productIds ?? [];
  const alfredPicks = alfredWidgetIds.length > 0 ? await getProductsByIds(alfredWidgetIds) : [];

  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={webSiteSchema()} />
      {/* One hero, then products. The page used to open with two navy
          blocks — Alfred's section, then a second hero carrying another
          search bar, the same two CTA buttons and a chat panel — with the
          category marquee wedged between them, so the first product card
          sat about 1,400px down on a desktop. Alfred's section already
          holds the h1, the search bar, the CTAs and the trust badges; the
          rest was repetition, and it is gone. The same order on every
          breakpoint: no per-viewport reshuffling to keep in step. */}
      <AlfredSection
        heroTitle={hero?.title ?? ""}
        heroSubtitle={hero?.subtitle ?? ""}
        ctaLabel={hero ? (hero.payload as { ctaLabel: string }).ctaLabel : undefined}
        ctaHref={hero ? (hero.payload as { ctaHref: string }).ctaHref : undefined}
      />

      <ProductRail title="מבצעים חמים" subtitle="הנחות לזמן מוגבל" products={deals} viewAllHref="/deals" />

      <CategoryExplorer />

      <FinderTeaser />

      <CategoryGrid tiles={categoryTiles} />

      {alfredPicks.length > 0 && (
        <ProductRail title="אלפרד ממליץ" subtitle="הבחירות של העוזר החכם שלנו להיום" products={alfredPicks} />
      )}

      <ProductRail title="הנמכרים ביותר" products={bestSellers} />

      {featured.length > 0 && (
        <ProductRail title="מומלצים במיוחד" products={featured} />
      )}

      <BrandStrip brands={brands} />

      {whyPrec && (
        <WhyPrec
          title={whyPrec.title ?? ""}
          items={whyPrec.payload as { title: string; body: string }[]}
        />
      )}
    </>
  );
}
