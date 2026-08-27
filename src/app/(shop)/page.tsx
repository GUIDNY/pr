import { Hero } from "@/components/home/hero";
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
import { getFavoriteProductIdsAction } from "@/actions/favorites";

export default async function HomePage() {
  const [hero, whyPrec, deals, bestSellers, featured, brands, favoriteIds, categoryTiles, alfredWidget] =
    await Promise.all([
      getHomepageSection("hero"),
      getHomepageSection("why-prec"),
      getDeals(8),
      getBestSellers(8),
      getFeaturedProducts(4),
      getFeaturedBrands(),
      getFavoriteProductIdsAction(),
      getCategoryTilesWithImages(),
      getHomepageSection("alfred-widget"),
    ]);

  // Admin-curated at /admin/homepage-alfred (payload.productIds); falls
  // back to today's first 3 deals so the widget never sits empty before an
  // admin has configured it.
  const alfredWidgetIds = (alfredWidget?.payload as { productIds?: string[] } | undefined)?.productIds ?? [];
  const alfredPicks = alfredWidgetIds.length > 0 ? await getProductsByIds(alfredWidgetIds) : deals.slice(0, 3);

  return (
    <>
      {/* Mobile-only reorder: Alfred's panel first, then top categories,
          then hot deals, then the Hero (title/CTA/benefits) — everything
          below this block keeps its normal document order untouched.
          `flex flex-col` only applies (and `order` only has any effect)
          below sm: — at sm: and up this reverts to `sm:block`, i.e. plain
          stacking in the original DOM order, so desktop is unaffected. */}
      <div className="flex flex-col sm:block">
        {/* Desktop order swapped: AlfredSection (the real hero content now
            — h1, CTA buttons, trust badges) leads, then CategoryExplorer,
            then the search-spotlight Hero, then deals. Each block keeps its
            own `order-N` class, which only does anything below sm:, so
            mobile's order (unchanged: Alfred, Explorer, deals, then the
            category grid in Hero's old slot) is untouched by this DOM
            reshuffle — only desktop's plain top-to-bottom stacking order,
            which follows DOM order, actually changes. */}
        <div className="order-1">
          <AlfredSection
            heroTitle={hero?.title ?? ""}
            heroSubtitle={hero?.subtitle ?? ""}
            ctaLabel={hero ? (hero.payload as { ctaLabel: string }).ctaLabel : undefined}
            ctaHref={hero ? (hero.payload as { ctaHref: string }).ctaHref : undefined}
          />
        </div>

        <div className="order-2">
          <CategoryExplorer />
        </div>

        <div className="order-4">
          {/* Mobile: the full real-category grid instead of the Hero.
              Desktop: the Hero, exactly as it always rendered here — kept
              in the DOM either way (not deleted), just one or the other is
              visually hidden per breakpoint. */}
          <div className="sm:hidden">
            <CategoryGrid tiles={categoryTiles} />
          </div>
          <div className="hidden sm:block">
            {hero && (
              <Hero
                ctaLabel={(hero.payload as { ctaLabel: string }).ctaLabel}
                ctaHref={(hero.payload as { ctaHref: string }).ctaHref}
                showcaseProducts={deals}
                alfredPicks={alfredPicks}
              />
            )}
          </div>
        </div>

        <div className="order-3">
          <ProductRail title="מבצעים חמים" subtitle="הנחות לזמן מוגבל" products={deals} viewAllHref="/deals" favoriteIds={favoriteIds} />
        </div>
      </div>

      <FinderTeaser />

      {/* Desktop only — directly below the finder teaser ("לא בטוחים מה
          לבחור?") now, before the product rails. The mobile copy of this
          same grid lives up in the Hero slot above, so it isn't repeated
          here below sm:. */}
      <div className="hidden sm:block">
        <CategoryGrid tiles={categoryTiles} />
      </div>

      <ProductRail title="הנמכרים ביותר" products={bestSellers} favoriteIds={favoriteIds} />

      {featured.length > 0 && (
        <ProductRail title="מומלצים במיוחד" products={featured} favoriteIds={favoriteIds} />
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
