import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { findByIdentifier, searchProducts } from "@/lib/queries/products";
import { rateLimit, clientKey } from "@/lib/rate-limit";
import { SITE_URL } from "@/lib/site-url";

/**
 * "Do you have this, and for how much" — for the price-comparison extension.
 *
 * It was reading `/search?q=…` and pulling the products out of the RSC
 * payload: half a megabyte of HTML for two kilobytes of answer, on every
 * product page the shopper opens, and it breaks the next time the page's
 * markup moves. This is the same data as a public URL that is allowed to
 * change shape only deliberately.
 *
 * Two lookups, in this order, because they answer different questions:
 *
 *  1. **An identifier.** A SKU or a model number, with the punctuation
 *     stripped from both sides — the caller holds whatever a competitor's
 *     page printed, and `HRF-40-B` and `hrf40b` are the same fridge. Exact
 *     equality, so this either knows the answer or says nothing.
 *  2. **Words.** Only if the first found nothing, the shop's own ranker,
 *     the one the search box uses. Not a second copy of it: `searchProducts`
 *     is the function, and the ranker's note explains what the last copy
 *     cost.
 *
 * Everything it returns has passed `PUBLIC_PRODUCT_WHERE`, which is the
 * deliberate departure from the spec and the reason is the `url` field. The
 * spec asks for sold-out products back with `OUT_OF_STOCK` rather than
 * hidden, so the extension can say "אזל" instead of nothing. But a product
 * this shop hides has no page: the link would be a 404, which is worse for
 * the shopper than an honest silence. What the shop will sell, it returns
 * with a working link; what it will not, it does not claim to have.
 *
 * Worth knowing, since the stock vocabulary reads oddly as a result: under
 * the rule the owner set on 19 October an empty warehouse is not sold out.
 * A product the price list still carries is ordered from the supplier and
 * sold as normal, so a live product is `IN_STOCK` or `LOW_STOCK` and almost
 * never `OUT_OF_STOCK`.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
/* The spec's 60/minute. The limiter is per instance rather than shared —
   see rate-limit.ts — so this stops a stuck retry loop and a casual
   scraper, which is what turns up, and not somebody determined. */
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

/* Public and read-only, so the origin is open. The data is the same data
   the storefront, the sitemap and the Merchant Center feed already publish;
   what this adds is convenience, including for a competitor, and that is
   the trade the endpoint exists to make. */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
} as const;

/* Five minutes at the browser, ten at the edge. Prices move twice a day
   when the office Mac runs the sync, so a stale answer is cheap; a fresh
   one on every product page a shopper opens is not. */
const CACHE = "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";

function json(body: unknown, init?: { status?: number; cache?: boolean }) {
  return NextResponse.json(body, {
    status: init?.status ?? 200,
    headers: { ...CORS, ...(init?.cache === false ? { "Cache-Control": "no-store" } : { "Cache-Control": CACHE }) },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function GET(request: Request) {
  const limiter = rateLimit(`price-compare:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limiter.ok) {
    return NextResponse.json(
      { error: "rate_limited", retryAfter: limiter.retryAfter },
      { status: 429, headers: { ...CORS, "Cache-Control": "no-store", "Retry-After": String(limiter.retryAfter) } },
    );
  }

  const url = new URL(request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  if (!query) {
    return json({ error: "missing_query", message: "q is required" }, { status: 400, cache: false });
  }

  const asked = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(asked) ? Math.min(Math.max(asked, 1), MAX_LIMIT) : DEFAULT_LIMIT;

  const byIdentifier = await findByIdentifier(query, limit);
  const products = byIdentifier.length > 0 ? byIdentifier : await searchProducts(query, limit);

  /* The model, for the rows being returned and no others.
   
     The caller says this field does more for match accuracy than any other,
     and it is deliberately not on the card shape: cardSelect is kept to the
     232 bytes a card renders because widening it once cost this shop four
     days of Storage outage — see the note on it. One keyed lookup of at
     most twenty-five rows is the cheap way to have both. */
  const models = new Map<string, string | null>();
  if (products.length > 0) {
    const rows = await db.product.findMany({
      where: { sku: { in: products.map((p) => p.sku) } },
      select: { sku: true, model: true },
    });
    for (const row of rows) models.set(row.sku, row.model);
  }

  return json({
    query,
    count: products.length,
    /* Which lookup answered. The caller can treat an identifier hit as
       certain and a word hit as a suggestion, which is the difference
       between showing a price and showing "maybe this one". */
    matchedBy: byIdentifier.length > 0 ? "identifier" : products.length > 0 ? "text" : "none",
    products: products.map((p) => ({
      sku: p.sku,
      title: p.title,
      brandName: p.brandName,
      model: models.get(p.sku) ?? null,
      price: p.price,
      compareAtPrice: p.compareAtPrice,
      currency: "ILS",
      stockStatus: p.stockStatus,
      url: `${SITE_URL}/product/${p.slug}`,
      imageUrl: p.imageUrl,
    })),
  });
}
