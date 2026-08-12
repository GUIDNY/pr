import { Hero } from "@/components/home/hero";
import { CategoryExplorer } from "@/components/home/category-explorer";
import { ProductRail } from "@/components/home/product-rail";
import { BrandStrip } from "@/components/home/brand-strip";
import { WhyPrec } from "@/components/home/why-prec";
import { FinderTeaser } from "@/components/home/finder-teaser";
import { getDeals, getBestSellers, getFeaturedProducts } from "@/lib/queries/products";
import { getHomepageSection, getActiveBrands } from "@/lib/queries/content";
import { getFavoriteProductIdsAction } from "@/actions/favorites";

export default async function HomePage() {
  const [hero, whyPrec, deals, bestSellers, featured, brands, favoriteIds] = await Promise.all([
    getHomepageSection("hero"),
    getHomepageSection("why-prec"),
    getDeals(8),
    getBestSellers(8),
    getFeaturedProducts(4),
    getActiveBrands(),
    getFavoriteProductIdsAction(),
  ]);

  return (
    <>
      {hero && (
        <Hero
          title={hero.title ?? ""}
          subtitle={hero.subtitle ?? ""}
          ctaLabel={(hero.payload as { ctaLabel: string }).ctaLabel}
          ctaHref={(hero.payload as { ctaHref: string }).ctaHref}
        />
      )}

      <CategoryExplorer />

      <ProductRail title="מבצעים חמים" subtitle="הנחות לזמן מוגבל" products={deals} viewAllHref="/deals" favoriteIds={favoriteIds} />

      <FinderTeaser />

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
