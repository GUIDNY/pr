import { SITE_URL } from "@/lib/site-url";
import type { StockStatus } from "@/lib/enums";

// The product feed Google Merchant Center fetches once a day.
//
// This is deliberately *not* the Merchant API: that needs a Google Cloud
// project, a service account and a push on every change, and this catalog's
// stock only moves when someone presses sync in the admin after a supplier
// sends a sheet. A pull-based feed has no secret to leak and no write path
// back into the catalog — it is a read of exactly what the storefront
// already shows.
//
// Which is the point of building it off PUBLIC_PRODUCT_WHERE rather than a
// hand-rolled where clause: Google suspends accounts over a feed that
// disagrees with the landing page, so "what is in the feed" has to be the
// same predicate as "what is on the site", not a second copy of it that
// drifts out of step the first time the store policy changes.

const CURRENCY = "ILS";

// Google's availability values, against this shop's own stock vocabulary.
// Anything not listed here is left out of the feed entirely rather than
// guessed at: a product the site marks DISCONTINUED, DISPLAY_ONLY or
// NEEDS_REVIEW is one nobody has promised can actually be bought today,
// and advertising it is how a mismatch penalty starts.
const AVAILABILITY: Partial<Record<StockStatus, string>> = {
  IN_STOCK: "in_stock",
  LOW_STOCK: "in_stock",
  SPECIAL_ORDER: "backorder",
  SUPPLIER_STOCK: "backorder",
};

// The same mapping in schema.org's vocabulary, for the JSON-LD on the
// product page. Google cross-checks a feed item against the structured data
// on the page it links to and flags the two when they disagree, so the two
// availabilities have to come from one table rather than two hand-written
// ones that agree today.
export const SCHEMA_AVAILABILITY: Partial<Record<StockStatus, string>> = {
  IN_STOCK: "https://schema.org/InStock",
  LOW_STOCK: "https://schema.org/InStock",
  SPECIAL_ORDER: "https://schema.org/BackOrder",
  SUPPLIER_STOCK: "https://schema.org/BackOrder",
};

// What a product the feed deliberately leaves out gets on its own page:
// it is still on sale here, but nothing has confirmed it can be shipped
// today, and claiming InStock for it is the mismatch above in reverse.
export const SCHEMA_AVAILABILITY_FALLBACK = "https://schema.org/LimitedAvailability";

export const SCHEMA_CURRENCY = CURRENCY;

// Google's own caps. An over-long value costs that item its listing, so
// they're trimmed here rather than sent and rejected.
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ADDITIONAL_IMAGES = 10;

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Product.description is stored as HTML — <h3> section headings, <p>
// paragraphs, <ul> spec lists — because that is what the product page
// renders. Google rejects markup in a feed description, so it is flattened
// to text here rather than sent as-is.
//
// Not a general-purpose HTML parser and not trying to be: the content is
// this shop's own stored copy, and the shapes it actually uses are the ones
// handled below. Block tags become line breaks so a spec list doesn't
// collapse into one run-on sentence, and every remaining tag is dropped.
export function toPlainText(html: string): string {
  return html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(?:br|\/p|\/h[1-6]|\/li|\/div|\/tr)\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    // Ampersand last, so "&amp;lt;" doesn't decode twice into a real tag.
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
}

// XML 1.0 has no escape for most control characters, and one stray byte
// makes the *whole* feed unparseable rather than just its own item —
// scraped descriptions are exactly where such a byte turns up.
function clean(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

// shortDescription first, and not just because it is shorter: it is the one
// plain-text summary in the record (every published product has one), while
// description is HTML for the page. The flattened long description is the
// fallback for a product that somehow has no summary.
export function feedDescription(p: {
  shortDescription: string | null;
  description: string | null;
  title: string;
}): string {
  const summary = p.shortDescription?.trim();
  if (summary) return summary;
  const long = p.description ? toPlainText(p.description).trim() : "";
  return long || p.title;
}

function tag(name: string, value: string, indent = "    "): string {
  return `${indent}<${name}>${xmlEscape(value)}</${name}>`;
}

function money(amount: number): string {
  return `${amount.toFixed(2)} ${CURRENCY}`;
}

export const GOOGLE_MERCHANT_FEED_PATH = "/feeds/google-merchant.xml";

/** Exactly what the renderer needs from a product — see the route's select. */
export type FeedProduct = {
  sku: string;
  slug: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  model: string | null;
  colorName: string | null;
  price: number;
  compareAtPrice: number | null;
  stockStatus: string;
  brand: { name: string };
  category: { name: string; parent: { name: string } | null };
  images: { url: string }[];
};

// Split from the query on purpose: every rule Google can reject an item over
// lives in here, taking plain rows, so it can be run and its output parsed
// without a database.
export function renderGoogleMerchantFeed(products: FeedProduct[]): string {
  const items: string[] = [];

  for (const p of products) {
    const availability = AVAILABILITY[p.stockStatus as StockStatus];
    if (!availability) continue;

    const [primaryImage, ...extraImages] = p.images;
    if (!primaryImage) continue; // PUBLIC_PRODUCT_WHERE already guarantees one

    const title = clean(p.title, MAX_TITLE);
    const description = clean(feedDescription(p), MAX_DESCRIPTION);
    if (!title || !description) continue;

    const lines = [
      // title, link and description without the g: prefix — RSS 2.0 defines
      // those three itself, and Google's own RSS sample uses the plain
      // elements for them and reserves g: for everything it adds.
      tag("g:id", p.sku),
      tag("title", title),
      tag("description", description),
      tag("link", `${SITE_URL}/product/${p.slug}`),
      tag("g:image_link", primaryImage.url),
      ...extraImages.slice(0, MAX_ADDITIONAL_IMAGES).map((img) => tag("g:additional_image_link", img.url)),
      tag("g:availability", availability),
      tag("g:condition", "new"),
      tag("g:brand", p.brand.name),
    ];

    // compareAtPrice is the *was* price, so when one is set Google wants it
    // as the regular price and the live price as the sale price. The other
    // way round advertises a struck-through price that never applied.
    if (p.compareAtPrice && p.compareAtPrice > p.price) {
      lines.push(tag("g:price", money(p.compareAtPrice)));
      lines.push(tag("g:sale_price", money(p.price)));
    } else {
      lines.push(tag("g:price", money(p.price)));
    }

    // No GTINs anywhere in this catalog — the supplier sheets carry no
    // barcode column. brand + mpn is the accepted substitute, and the
    // manufacturer's own model number is a real field here (Product.model,
    // never the internal sku). Without one Google has to be told the item
    // genuinely has no identifier, or it rejects it for a missing one.
    if (p.model) {
      lines.push(tag("g:mpn", p.model));
    } else {
      lines.push(tag("g:identifier_exists", "no"));
    }

    if (p.colorName) lines.push(tag("g:color", p.colorName));

    const productType = [p.category.parent?.name, p.category.name].filter(Boolean).join(" > ");
    if (productType) lines.push(tag("g:product_type", productType));

    items.push(`  <item>\n${lines.join("\n")}\n  </item>`);
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    tag("title", "פ.ר. אלקטרוניקה"),
    tag("link", SITE_URL),
    tag("description", "קטלוג המוצרים של פ.ר. אלקטרוניקה"),
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
