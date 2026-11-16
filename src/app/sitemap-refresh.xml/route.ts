import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";

/* The sellable product pages OAI-SearchBot has not fetched in the last 14
   days. Listed in robots.txt next to sitemap.xml and sitemap-recent.xml.

   sitemap-recent.xml covers pages whose price or stock just changed. This
   covers the other half of the same problem: pages that are right, but that
   ChatGPT search has never read, or read so long ago that what it holds is
   wrong. Measured on 16 November against 30 competitive products in stock:
   7 were the cheapest offer ChatGPT could have shown and it showed none of
   them, and 5 of those 7 had not been fetched by OAI-SearchBot once in 30
   days. Three more were shown at a price we had changed weeks earlier.

   lastmod is the last real price or stock change, when there was one, and
   is left out otherwise. A page listed here has not necessarily changed;
   claiming it did would be the invented date sitemap.ts refuses to write. */

export const revalidate = 3600;

const WINDOW_DAYS = 14;

const COMMERCE_CHANGES = [
  "PRICE_CHANGED",
  "BACK_IN_STOCK",
  "BECAME_OUT_OF_STOCK",
  "STOCK_INCREASED",
  "STOCK_DECREASED",
  "NEW_PRODUCT",
];

export async function GET() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [products, fetched] = await Promise.all([
    db.product.findMany({ where: PUBLIC_PRODUCT_WHERE, select: { id: true, slug: true } }),
    db.crawlerHit.findMany({
      where: { bot: "OAI-SearchBot", verified: true, createdAt: { gte: since }, path: { startsWith: "/product/" } },
      select: { path: true },
      distinct: ["path"],
    }),
  ]);

  const seen = new Set(fetched.map((h) => h.path));
  const unseen = products.filter((p) => !seen.has(`/product/${p.slug}`));

  const changes = unseen.length
    ? await db.inventoryChangeEvent.groupBy({
        by: ["productId"],
        where: { productId: { in: unseen.map((p) => p.id) }, changeType: { in: COMMERCE_CHANGES } },
        _max: { createdAt: true },
      })
    : [];
  const lastChange = new Map<string, Date>();
  for (const c of changes) if (c.productId && c._max.createdAt) lastChange.set(c.productId, c._max.createdAt);

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    unseen
      .map((p) => {
        const at = lastChange.get(p.id);
        const loc = `<loc>${escapeXml(`${SITE_URL}/product/${p.slug}`)}</loc>`;
        return at ? `<url>${loc}<lastmod>${at.toISOString()}</lastmod></url>` : `<url>${loc}</url>`;
      })
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
