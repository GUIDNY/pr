import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { ProductPageView } from "@/components/product/product-page-view";
import { getProductBySlug, getCurrentSlugForLegacySlug } from "@/lib/queries/products";

// The public product page, and the reason it is worth having two of them.
//
// This route never asks who is looking, so Next can build it once and a CDN
// can hold it: a visitor in Israel gets it from an edge near them instead of
// waiting on a function in Sydney. Measured before this split, a cold product
// page took ~900-1,170ms; every one of those milliseconds was paid by every
// crawler on all 1,429 products.
//
// The admin's inline editors need the session, and reading a session is
// exactly what makes a route uncacheable. So they live at product-admin/,
// and proxy.ts sends signed-in browsers there. Anonymous traffic — nearly
// all of it, and every crawler — never leaves this route.
// generateStaticParams is what makes the caching happen at all, and returning
// nothing from it is deliberate: without the export, a route with a [slug] is
// rendered on demand and never cached, whatever `revalidate` says — measured,
// not assumed. With it and an empty list, a build does not walk 1,429
// products, and each page is cached the first time it is asked for.
export const revalidate = 300;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  // The same gate the page renders on, and only that gate. Stock is not part
  // of it: a sold-out product answers 200 now, and a 200 with no title and no
  // canonical is indistinguishable from a 404 to anything reading the page —
  // which is exactly how it looked when this was checked in production.
  if (!product || !product.isPublished || product.images.length === 0) return {};
  return {
    title: product.title,
    description: product.shortDescription ?? product.description ?? undefined,
    // Always the product's own slug, never the requested one: a legacy
    // address renders nothing here (the page redirects before this matters),
    // and the live page must never point a canonical at a URL that 301s.
    alternates: { canonical: `/product/${product.slug}` },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A product that has been renamed is still reachable at the address it was
  // shared under. The old slug is in Google's index and in whatever a customer
  // pasted into WhatsApp, and neither gets a chance to update itself, so the
  // move is announced with a permanent redirect rather than served as a 404 —
  // see lib/product-slug-history.ts. Only reached once the live lookup has
  // missed, so an ordinary page view does not pay for it.
  if (!(await getProductBySlug(slug))) {
    const current = await getCurrentSlugForLegacySlug(slug);
    if (current) permanentRedirect(`/product/${current}`);
    notFound();
  }

  return <ProductPageView slug={slug} isAdminViewer={false} />;
}
