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
    gtin13: null,
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
  // The barcodes are empty today and will arrive from the ERP, which is
  // exactly the import that writes a UPC-A into an EAN-13 column. These
  // four rows are the shapes that arrive with it.
  product({ sku: "GTIN", gtin13: "7290012345678" }),
  product({ sku: "GTINONLY", gtin13: "7290012345678", model: null }),
  product({ sku: "GTINBAD", gtin13: "729001234567", model: null }),
  product({ sku: "GTINSPACED", gtin13: "7290-0123-45678" }),
  // Delivery is free above the threshold, so the shipping cost a feed item
  // quotes genuinely differs per item.
  product({ sku: "FREESHIP", price: 9900 }),
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
for (const included of ["PLAIN", "HTMLDESC", "ONSALE", "NOMODEL", "BACKORDER", "GTIN", "GTINONLY", "GTINBAD", "GTINSPACED", "FREESHIP"]) {
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

/* Identifiers. A GTIN is the strongest signal Google takes; brand + mpn is
   the accepted substitute; identifier_exists=no is the admission that there
   is neither — and sending that on an item which does have brand + mpn
   throws away a match, which is why it is conditional on both being absent
   rather than on the barcode alone. */
check("mpn comes from the model number", (items.get("PLAIN") ?? "").includes("<g:mpn>MODEL-1</g:mpn>"));
check("no identifier at all declares identifier_exists=no", (items.get("NOMODEL") ?? "").includes("<g:identifier_exists>no</g:identifier_exists>"));
check("no model sends no mpn", !(items.get("NOMODEL") ?? "").includes("<g:mpn>"));

check("a barcode is sent as g:gtin", (items.get("GTIN") ?? "").includes("<g:gtin>7290012345678</g:gtin>"));
check("a barcode does not replace the mpn", (items.get("GTIN") ?? "").includes("<g:mpn>MODEL-1</g:mpn>"));
check("having a barcode never declares identifier_exists=no", !(items.get("GTIN") ?? "").includes("identifier_exists"));
// The case the conditional exists for: an item with a barcode and no model
// still has an identifier, and must not disclaim one.
check("barcode without a model still has an identifier", !(items.get("GTINONLY") ?? "").includes("identifier_exists"));

// A 12-digit UPC-A in an EAN-13 column is a rejected item, not a near miss.
check("a 12-digit code is not sent as a gtin", !(items.get("GTINBAD") ?? "").includes("<g:gtin>"));
check("a rejected code falls back to identifier_exists", (items.get("GTINBAD") ?? "").includes("<g:identifier_exists>no</g:identifier_exists>"));
check("separators are stripped rather than sent", (items.get("GTINSPACED") ?? "").includes("<g:gtin>7290012345678</g:gtin>"));

/* Shipping. Without it the rate shown in a listing is whatever the account
   is configured with, which is not necessarily what this checkout charges. */
for (const sku of ["PLAIN", "FREESHIP"]) {
  check(`${sku} carries a shipping block`, (items.get(sku) ?? "").includes("<g:shipping>"));
  check(`${sku} names the country`, (items.get(sku) ?? "").includes("<g:country>IL</g:country>"));
}
check("below the threshold quotes the delivery fee", (items.get("PLAIN") ?? "").includes("<g:price>49.00 ILS</g:price>"));
check("above the threshold quotes free delivery", (items.get("FREESHIP") ?? "").includes("<g:price>0.00 ILS</g:price>"));

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
