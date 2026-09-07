import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BrandPageView } from "@/components/brand/brand-page-view";
import { getProductsByBrandSlug, getCurrentSlugForLegacyBrandSlug } from "@/lib/queries/products";

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
  const { brand } = await getProductsByBrandSlug(slug);
  if (!brand) return {};
  return {
    title: brand.name,
    description: brand.description ?? undefined,
    // The brand's own slug, never the one that was asked for: a page reached
    // through an old address must not declare that old address canonical.
    alternates: { canonical: `/brand/${brand.slug}` },
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
