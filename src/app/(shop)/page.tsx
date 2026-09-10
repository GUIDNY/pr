import { ShopHero } from "@/components/home/shop-hero";
import { DepartmentBoard } from "@/components/home/department-board";
import { AlfredHelper } from "@/components/home/alfred-helper";
import { CategoryGrid } from "@/components/home/category-grid-mobile";
import { ProductRail } from "@/components/home/product-rail";
import { BrandStrip } from "@/components/home/brand-strip";
import { WhyPrec } from "@/components/home/why-prec";
import { FinderTeaser } from "@/components/home/finder-teaser";
import { getDeals, getNewestProducts, getHeroProduct, getProductsByIds } from "@/lib/queries/products";
import { getHomepageSection, getFeaturedBrands } from "@/lib/queries/content";
import { getCategoryTilesWithImages, getDepartmentBoard } from "@/lib/queries/categories";
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
  const [hero, whyPrec, deals, newest, brands, categoryTiles, board, showcase, alfredWidget] =
    await Promise.all([
      getHomepageSection("hero"),
      getHomepageSection("why-prec"),
      getDeals(8),
      getNewestProducts(8),
      getFeaturedBrands(),
      getCategoryTilesWithImages(),
      getDepartmentBoard(),
      getHeroProduct(),
      getHomepageSection("alfred-widget"),
    ]);

  // Admin-curated at /admin/homepage-alfred (payload.productIds); falls
  // back to today's first 3 deals so the widget never sits empty before an
  // admin has configured it.
  const alfredWidgetIds = (alfredWidget?.payload as { productIds?: string[] } | undefined)?.productIds ?? [];
  const alfredPicks = alfredWidgetIds.length > 0 ? await getProductsByIds(alfredWidgetIds) : deals.slice(0, 3);

  return (
    <>
      <JsonLd data={organizationSchema()} />
      <JsonLd data={webSiteSchema()} />

      {/* The order is the order a stranger's questions arrive in, and it is
          the same on both breakpoints now. It used to differ: three blocks
          carried `order-N` classes that applied only below sm:, so mobile
          and desktop read the homepage in two different sequences and any
          change to one had to be reasoned about twice. One sequence is
          easier to be right about than two.

          What a first-time visitor asks, in order — is this a real shop,
          does it have my kind of thing, what does it cost, and who do I
          call — is what these sections answer, top to bottom. */}

      {/* 1. Who this is. */}
      <ShopHero
        productCount={board.total}
        departmentCount={board.departments.length}
        showcase={showcase}
        ctaLabel={hero ? (hero.payload as { ctaLabel: string }).ctaLabel : undefined}
        ctaHref={hero ? (hero.payload as { ctaHref: string }).ctaHref : undefined}
      />

      {/* 2. How big it is, and in what. Baymard's finding on homepages that
             show a narrow slice of the range: visitors misjudge the kind of
             shop and underestimate what it carries. */}
      <DepartmentBoard departments={board.departments} total={board.total} />

      {/* 3. Real products, early, so the page shows goods and prices before
             it asks for anything. Not "bestsellers": that rail queried a
             flag set on none of the 2,000 products and had been rendering
             nothing, and there are two orders in the database to rank by.
             A shop with no sales history cannot say what is popular. */}
      <div className="bg-secondary/40 border-border border-y">
        <ProductRail eyebrow="מהמדפים" title="חדש בקטלוג" subtitle="הגיעו אלינו לאחרונה" products={newest} />
      </div>

      {/* 4. The catalogue by category, in photographs. */}
      <CategoryGrid tiles={categoryTiles} />

      <ProductRail eyebrow="מבצעים" title="במחיר מיוחד" subtitle="הנחות לזמן מוגבל" products={deals} viewAllHref="/deals" />

      {/* 5. Help choosing, once there is something to choose between. */}
      <AlfredHelper picks={alfredPicks} />

      <FinderTeaser />

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
