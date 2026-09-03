import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { renderGoogleMerchantFeed } from "@/lib/feeds/google-merchant";

// Served from /feeds/, not /api/, on purpose: robots.ts disallows /api for
// every crawler, and Merchant Center's fetcher honours robots.txt — a feed
// URL it isn't allowed to read fails the scheduled fetch with an error that
// says nothing about robots.
//
// force-dynamic for the same reason sitemap.ts is a live query: without it
// Next tries to render this at build time, and DATABASE_URL is a
// Production-only variable here, so every Preview build would die reaching
// for 127.0.0.1:5432. The s-maxage below is what actually keeps it cheap —
// the CDN answers, and Google only pulls once a day anyway.
export const dynamic = "force-dynamic";

export async function GET() {
  // PUBLIC_PRODUCT_WHERE rather than a hand-rolled where clause: Google
  // penalises a feed that disagrees with the page it links to, so "what is
  // in the feed" has to be the same predicate as "what is on the site".
  const products = await db.product.findMany({
    where: PUBLIC_PRODUCT_WHERE,
    select: {
      sku: true,
      slug: true,
      title: true,
      description: true,
      shortDescription: true,
      model: true,
      colorName: true,
      price: true,
      compareAtPrice: true,
      stockStatus: true,
      brand: { select: { name: true } },
      category: { select: { name: true, parent: { select: { name: true } } } },
      images: { select: { url: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sku: "asc" },
  });

  return new Response(renderGoogleMerchantFeed(products), {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
