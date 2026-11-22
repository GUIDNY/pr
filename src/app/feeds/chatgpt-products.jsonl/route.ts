import { db } from "@/lib/db";
import { FEED_PRODUCT_WHERE } from "@/lib/feeds/feed-where";
import { renderChatgptFeed } from "@/lib/feeds/chatgpt-products";

/**
 * The product feed ChatGPT fetches from a hosted URL (Business Hub). Public on
 * purpose — ChatGPT's fetcher cannot log in — and so it carries nothing that is
 * not already on a product page: no cost, no stock count, no customer data.
 *
 * Under /feeds/ and not /api/ for the same reason the Google feed is:
 * robots.ts disallows /api for every crawler.
 *
 * force-dynamic, as for the Google feed: DATABASE_URL is Production-only here,
 * so a static render would fail every Preview build. The Cache-Control below is
 * what keeps it cheap, and it expires every half hour so a price or stock change
 * reaches ChatGPT within the next pull, which is at least twice a day.
 *
 * The response carries its own counts in headers (never in the body, which must
 * stay pure JSONL) so a check from outside can read them without parsing.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const products = await db.product.findMany({
    where: FEED_PRODUCT_WHERE,
    select: {
      sku: true,
      slug: true,
      title: true,
      description: true,
      shortDescription: true,
      model: true,
      gtin13: true,
      colorName: true,
      variantGroupId: true,
      price: true,
      compareAtPrice: true,
      stockStatus: true,
      brand: { select: { name: true } },
      category: { select: { name: true, parent: { select: { name: true } } } },
      images: { select: { url: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sku: "asc" },
  });

  const feed = renderChatgptFeed(products);

  return new Response(feed.body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "X-Feed-Items": String(feed.included),
      "X-Feed-Skipped-No-Own-Image": String(feed.skippedNoOwnImage),
      "X-Feed-Skipped-Other": String(feed.skippedOther),
    },
  });
}
