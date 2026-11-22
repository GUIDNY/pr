import { buildChatgptFeed } from "@/lib/feeds/chatgpt-feed-query";

/**
 * The product feed ChatGPT fetches from a hosted URL (Business Hub). Public on
 * purpose — ChatGPT's fetcher cannot log in — and so it carries nothing that is
 * not already on a product page: no cost, no stock count, no customer data.
 *
 * Business Hub accepts a gzip-compressed JSONL file, not plain JSONL, so the
 * address it is given is /feeds/chatgpt-products.jsonl.gz (same content). This
 * plain one stays for reading and for tools that want the text.
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
  const feed = await buildChatgptFeed();

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
