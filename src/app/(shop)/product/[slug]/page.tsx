import type { Metadata } from "next";
import { shareMetadata } from "@/lib/seo/share-metadata";
import { notFound, permanentRedirect, redirect } from "next/navigation";
import { ProductPageView } from "@/components/product/product-page-view";
import {
  getProductBySlug,
  getCurrentSlugForLegacySlug,
  hiddenProductFallback,
  isOffCatalogue,
} from "@/lib/queries/products";

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
  if (isOffCatalogue(product)) return {};
  // Always the product's own slug, never the requested one: a legacy
  // address renders nothing here (the page redirects before this matters),
  // and the live page must never point a canonical at a URL that 301s.
  return shareMetadata({
    title: product.title,
    description: product.shortDescription ?? product.description ?? undefined,
    path: `/product/${product.slug}`,
    image: product.images[0]?.url,
  });
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // A product that has been renamed is still reachable at the address it was
  // shared under. The old slug is in Google's index and in whatever a customer
  // pasted into WhatsApp, and neither gets a chance to update itself, so the
  // move is announced with a permanent redirect rather than served as a 404 —
  // see lib/product-slug-history.ts. Only reached once the live lookup has
  // missed, so an ordinary page view does not pay for it.
  const product = await getProductBySlug(slug);
  if (!product) {
    const current = await getCurrentSlugForLegacySlug(slug);
    if (current) permanentRedirect(`/product/${current}`);
    notFound();
  }
  /* A product that is off the site — unpublished, without a photo, or not
     carried by any price list — used to answer 404 here. Google was still
     ranking 41 such addresses and sending a customer to an error page on
     one click in eight. The product is not gone, so the address is sent
     somewhere real instead: the published twin of the same brand and model
     when there is one, permanently; its category otherwise, temporarily,
     because the product may come back to this very address. See
     hiddenProductFallback.
     The price-list condition is here and not only in PUBLIC_PRODUCT_WHERE
     because this address is reached on its own — every list, the search,
     the cart and the feed spread that constant and cannot show such a
     product, while this page was rendering whatever existed at the slug. A
     record created by the admin form or by POST /api/integrations/products
     has no source at all and had a fully working public page. The owner's
     rule, 11 October: a product that is not in the price list must not
     appear on the site. */
  if (!product.isPublished || product.images.length === 0 || isOffCatalogue(product)) {
    const fallback = await hiddenProductFallback(product);
    if (fallback.kind === "product") permanentRedirect(`/product/${fallback.slug}`);
    if (fallback.slug) redirect(`/category/${fallback.slug}`);
    notFound();
  }

  return <ProductPageView slug={slug} isAdminViewer={false} />;
}
