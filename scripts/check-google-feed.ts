// Guards the Google Merchant Center product feed.
//
// The feed is fetched by Google once a day and every rule it breaks is
// enforced on Google's side, out of sight: an item with an unescaped
// ampersand takes the whole file down as unparseable, HTML left in a
// description gets the item rejected, and a price or availability that
// disagrees with the product page it links to is what an account gets
// suspended over. None of that shows up in a build or a page render, so it
// is checked here instead.
//
// Deliberately fixture-driven rather than a query: this is about the rules
// the renderer applies, and the rows below are shaped after real ones from
// the catalog — HTML descriptions with <h3>/<ul>, Hebrew titles carrying
// ASCII quotes for ס"מ and אינץ', an "A&I" in the body text.
//
// Run: npx tsx scripts/check-google-feed.ts
import { renderGoogleMerchantFeed, toPlainText, type FeedProduct } from "../src/lib/feeds/google-merchant";
import { SITE_URL } from "../src/lib/site-url";

function product(over: Partial<FeedProduct> & { sku: string }): FeedProduct {
  return {
    slug: `slug-${over.sku}`,
    title: "מוצר לבדיקה",
    description: null,
    shortDescription: "תיאור קצר תקין.",
    model: "MODEL-1",
    colorName: null,
    price: 100,
    compareAtPrice: null,
    stockStatus: "IN_STOCK",
    brand: { name: "Bosch" },
    category: { name: "מדיח כלים", parent: { name: "מטבח" } },
    images: [{ url: "https://example.com/a.jpg" }],
    ...over,
  };
}

const rows: FeedProduct[] = [
  product({
    sku: "PLAIN",
    title: "זרוע מפרקית EAZO PRO6890 למסכים עד 75 אינץ' - פתיחה 63.5 ס\"מ",
    shortDescription: "זרוע קיר מפרקית למסכים עד 75 אינץ' ובמשקל עד 65 ק\"ג.",
  }),
  // Description is HTML in the database, always — this is the shape of a
  // real one, including an entity and a bare & that both have to survive
  // the round trip as valid XML.
  product({
    sku: "HTMLDESC",
    shortDescription: null,
    description:
      "<h3>נפח</h3>\n<ul>\n<li>נפח שימושי: 326 ליטר</li>\n</ul>\n<p>צוות A&I ישמח לעזור.&nbsp;5 &gt; 3.</p>",
  }),
  product({ sku: "ONSALE", price: 7200, compareAtPrice: 8400 }),
  product({ sku: "NOMODEL", model: null }),
  product({ sku: "BACKORDER", stockStatus: "SPECIAL_ORDER" }),
  product({ sku: "GONE", stockStatus: "DISCONTINUED" }),
  product({ sku: "REVIEW", stockStatus: "NEEDS_REVIEW" }),
  product({ sku: "SHOWROOM", stockStatus: "DISPLAY_ONLY" }),
];

const xml = renderGoogleMerchantFeed(rows);
const items = new Map(
  [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => [/<g:id>(.*?)<\/g:id>/.exec(m[1])![1], m[1]]),
);

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return;
  console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  failed++;
}

// A stray & is not a bad item, it is a bad *file*: Google can't parse any
// of it and the whole feed goes stale at its last good version.
check("no unescaped ampersand", !/&(?!amp;|lt;|gt;|quot;|apos;)/.test(xml));
check("no markup left in any value", !/<(?:p|br|h[1-6]|ul|ol|li|strong|em|div|span)\b/i.test(xml));
check("no control characters", !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(xml));

// Stock states nobody has confirmed can ship today stay out of the feed
// rather than being advertised as available.
for (const excluded of ["GONE", "REVIEW", "SHOWROOM"]) {
  check(`${excluded} is kept out of the feed`, !items.has(excluded));
}
for (const included of ["PLAIN", "HTMLDESC", "ONSALE", "NOMODEL", "BACKORDER"]) {
  check(`${included} is in the feed`, items.has(included));
}

for (const [sku, item] of items) {
  for (const required of ["g:id", "title", "description", "link", "g:image_link", "g:price", "g:availability", "g:condition", "g:brand"]) {
    check(`${sku} has <${required}>`, item.includes(`<${required}>`));
  }
  // Every link has to sit on the domain claimed in Merchant Center, or the
  // item is rejected for pointing somewhere the account doesn't own.
  const link = /<link>(.*?)<\/link>/.exec(item)?.[1] ?? "";
  check(`${sku} links to the claimed domain`, link.startsWith(`${SITE_URL}/product/`), link);
  check(`${sku} prices in ILS`, /<g:price>\d+\.\d{2} ILS<\/g:price>/.test(item));
}

// compareAtPrice is the "was" price: it belongs in g:price, with the live
// price as g:sale_price. Reversed, the feed advertises a discount off a
// number the shop never charged.
const onSale = items.get("ONSALE") ?? "";
check("a sale shows the old price as g:price", onSale.includes("<g:price>8400.00 ILS</g:price>"));
check("a sale shows the live price as g:sale_price", onSale.includes("<g:sale_price>7200.00 ILS</g:sale_price>"));
check("a full-price item has no g:sale_price", !(items.get("PLAIN") ?? "").includes("g:sale_price"));

// This catalog has no barcodes, so brand + mpn is the identifier. A product
// with no manufacturer model number has to say so explicitly, or Google
// rejects it for a missing identifier it was never going to have.
check("mpn comes from the model number", (items.get("PLAIN") ?? "").includes("<g:mpn>MODEL-1</g:mpn>"));
check("no model declares identifier_exists=no", (items.get("NOMODEL") ?? "").includes("<g:identifier_exists>no</g:identifier_exists>"));
check("no model sends no mpn", !(items.get("NOMODEL") ?? "").includes("<g:mpn>"));

check("special order maps to backorder", (items.get("BACKORDER") ?? "").includes("<g:availability>backorder</g:availability>"));
check("in stock maps to in_stock", (items.get("PLAIN") ?? "").includes("<g:availability>in_stock</g:availability>"));

// The HTML description has to come out as readable text, not as a tagless
// run-on with the list items welded together.
const flattened = toPlainText(rows[1].description!);
check("html description keeps its text", flattened.includes("נפח שימושי: 326 ליטר"));
check("html description decodes entities", flattened.includes("A&I") && flattened.includes("5 > 3"));
check("html description breaks between blocks", /ליטר\n/.test(flattened));

console.log(
  failed === 0
    ? `OK  ${items.size} items rendered from ${rows.length} products, ${rows.length - items.size} correctly withheld`
    : `${failed} check(s) failed`,
);
process.exit(failed === 0 ? 0 : 1);
