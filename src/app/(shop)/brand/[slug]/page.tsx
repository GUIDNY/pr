import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BrandPageView } from "@/components/brand/brand-page-view";
import { getProductsByBrandSlug, getCurrentSlugForLegacyBrandSlug, LISTING_MIN_PRODUCTS } from "@/lib/queries/products";

// The canonical brand page: no sort chosen, which is what a crawler asks for
// and what nearly every visitor lands on.
//
// This route reads no search params, so it can be prerendered and held by a
// CDN. It was the one listing route left paying `private, no-store` on every
// request — 147 pages hitting the origin on every crawl. generateStaticParams
// returning nothing is what turns the caching on at all without a build
// walking every brand; see product/[slug]/page.tsx for the measurement.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const { brand, total } = await getProductsByBrandSlug(slug);
  if (!brand) return {};
  return {
    title: brand.name,
    description: brand.description ?? undefined,
    // The brand's own slug, never the one that was asked for: a page reached
    // through an old address must not declare that old address canonical.
    alternates: { canonical: `/brand/${brand.slug}` },
    /* A brand with almost nothing on the site is a thin page, and a thin
       page indexed under a brand name is a result that disappoints whoever
       clicks it.
       
       Fewer than LISTING_MIN_PRODUCTS rather than zero, and the change
       matters: these were taken out of the sitemap, which stopped offering
       them and did not deindex them. The URLs still answer 200, so Google
       keeps what it already holds — and 105 of this site's 154 brand pages
       are already sitting in "crawled, not indexed", which is Google having
       made that judgement for itself.
       
       The same constant the sitemap reads, because a page offered in one
       breath and refused in the next is the contradiction this is meant to
       end. It says so itself rather than relying on nobody finding it, and
       it starts being indexable again on its own the moment it has a third
       product. */
    robots: total < LISTING_MIN_PRODUCTS ? { index: false, follow: true } : undefined,
  };
}

export default async function BrandPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A renamed brand keeps answering at the address it was linked from — see
  // lib/legacy-slug-redirects.ts for why the same rules also live in
  // next.config, and what happens when they only live here.
  const { brand } = await getProductsByBrandSlug(slug);
  if (!brand) {
    const current = await getCurrentSlugForLegacyBrandSlug(slug);
    if (current) permanentRedirect(`/brand/${current}`);
    notFound();
  }

  return <BrandPageView slug={slug} />;
}
