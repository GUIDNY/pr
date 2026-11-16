import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";

/* The product pages whose price or stock really changed in the last seven
   days, each dated by that change. Listed in robots.txt next to sitemap.xml.

   Why a second file, when sitemap.xml already lists every product: because
   sitemap.xml cannot say which of them changed. Product.updatedAt moves on
   every sync for nearly every row (2,410 of the photographed products carry
   the 15 November sync as their date), mostly because the sync records the
   sheet's own wording of the title — PRODUCT_DATA_CHANGED, ~2,700 a run —
   which is not a change to the page. A crawler that sees everything dated
   the same morning learns to ignore the date.

   Answer engines are the reason this matters. ChatGPT search showed one of
   our products as "sold out" on 16 November while its page said in stock:
   OAI-SearchBot had last fetched it on 26 October. This file is the short,
   honest list of pages whose price or availability a crawler is now holding
   wrong, so a recrawl can start there.

   Only events that change what the page says to a buyer count. NEW_PRODUCT
   counts too — a page that did not exist is the strongest change there is.

   Same eligibility as sitemap.xml: published, photographed, from an active
   price list. Sold-out pages stay in, because "this went out of stock" is
   exactly the change a crawler needs to see. */

export const revalidate = 3600;

const WINDOW_DAYS = 7;

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

  const changed = await db.inventoryChangeEvent.groupBy({
    by: ["productId"],
    where: { createdAt: { gte: since }, changeType: { in: COMMERCE_CHANGES }, productId: { not: null } },
    _max: { createdAt: true },
  });

  const lastChange = new Map<string, Date>();
  for (const c of changed) if (c.productId && c._max.createdAt) lastChange.set(c.productId, c._max.createdAt);

  const products = lastChange.size
    ? await db.product.findMany({
        where: {
          id: { in: [...lastChange.keys()] },
          isPublished: true,
          images: { some: {} },
          source: { is: { sourceType: "EXCEL", isActive: true } },
        },
        select: { id: true, slug: true },
      })
    : [];

  const rows = products
    .map((p) => ({ slug: p.slug, at: lastChange.get(p.id)! }))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    rows
      .map(
        (r) =>
          `<url><loc>${escapeXml(`${SITE_URL}/product/${r.slug}`)}</loc><lastmod>${r.at.toISOString()}</lastmod></url>`
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

function escapeXml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
