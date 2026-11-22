// Guards the ChatGPT product feed without a database or a network.
// Run: npx tsx scripts/check-chatgpt-feed.ts
import { chatgptImageUrl, renderChatgptFeed, type ChatgptFeedProduct } from "../src/lib/feeds/chatgpt-products";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failed++; }
};
const ok = (name: string, cond: boolean) => eq(name, cond, true);

const OWN = "https://buytoday.co.il/img/product-images/migrated/v2/p1/a.webp";
const base = (over: Partial<ChatgptFeedProduct>): ChatgptFeedProduct => ({
  sku: "1001", slug: "fridge-a", title: "מקרר א", description: "<p>ארוך</p>", shortDescription: "תיאור קצר",
  model: "RT53", gtin13: null, colorName: null, variantGroupId: null, price: 1790, compareAtPrice: null,
  stockStatus: "IN_STOCK", brand: { name: "Samsung" }, category: { name: "מקררים", parent: { name: "קירור" } },
  images: [{ url: OWN }], ...over,
});

// Images: ours only, JPEG or PNG only.
eq("webp becomes jpg", chatgptImageUrl(OWN), OWN.replace(".webp", ".jpg"));
eq("jpg kept", chatgptImageUrl("https://buytoday.co.il/img/x/y.jpg"), "https://buytoday.co.il/img/x/y.jpg");
eq("png kept", chatgptImageUrl("https://buytoday.co.il/img/x/y.png"), "https://buytoday.co.il/img/x/y.png");
eq("hotlink refused", chatgptImageUrl("https://www.prec.co.il/images/x.jpg"), null);
eq("own webp outside migrated refused", chatgptImageUrl("https://buytoday.co.il/img/x/y.webp"), null);
eq("lookalike host refused", chatgptImageUrl("https://buytoday.co.il.evil.com/img/a.jpg"), null);

const feed = renderChatgptFeed([
  base({}),
  base({ sku: "1002", slug: "hot", images: [{ url: "https://www.prec.co.il/a.jpg" }] }),
  base({ sku: "1003", slug: "mixed", images: [{ url: "https://www.prec.co.il/a.jpg" }, { url: OWN.replace("p1", "p3") }] }),
  base({ sku: "1004", slug: "sale", price: 1500, compareAtPrice: 1800 }),
  base({ sku: "1005", slug: "disc", stockStatus: "DISCONTINUED" }),
  base({ sku: "1006", slug: "backorder", stockStatus: "SPECIAL_ORDER" }),
  base({ sku: "1007", slug: "notext", shortDescription: null, description: null, title: "   " }),
]);
const rows = feed.body.trim().split("\n").map((l) => JSON.parse(l));
eq("included", feed.included, 4);
eq("rows match count", rows.length, 4);
eq("hotlink-only left out", feed.skippedNoOwnImage, 1);
eq("others left out", feed.skippedOther, 2);
eq("ids", rows.map((r) => r.item_id), ["1001", "1003", "1004", "1006"]);
ok("mixed product uses the own image", rows[1].image_url.includes("/p3/") && rows[1].image_url.endsWith(".jpg"));

const REQUIRED = ["item_id", "title", "description", "url", "brand", "seller_name", "image_url", "availability", "price", "target_countries", "store_country"];
for (const r of rows) {
  for (const k of REQUIRED) ok(`${r.item_id} has ${k}`, r[k] !== undefined && r[k] !== "" && r[k] !== null);
  ok(`${r.item_id} price format`, /^\d+\.\d{2} ILS$/.test(r.price));
  ok(`${r.item_id} availability valid`, ["in_stock", "backorder", "out_of_stock", "pre_order", "unknown"].includes(r.availability));
  ok(`${r.item_id} UTM on url`, r.url.endsWith("?utm_source=chatgpt&utm_medium=shopping"));
  ok(`${r.item_id} image is own jpeg`, /^https:\/\/buytoday\.co\.il\/img\/.+\.(jpg|png)$/.test(r.image_url));
  ok(`${r.item_id} title cap`, r.title.length <= 150);
  eq(`${r.item_id} market`, [r.target_countries, r.store_country], [["IL"], "IL"]);
}
eq("sale: regular price is the was-price", [rows[2].price, rows[2].sale_price], ["1800.00 ILS", "1500.00 ILS"]);
ok("no sale_price when none", rows[0].sale_price === undefined);
eq("backorder", rows[3].availability, "backorder");
ok("no webp anywhere in the feed", !feed.body.includes(".webp"));
ok("description is plain text", !rows[0].description.includes("<"));
ok("never a customer field", !/email|phone|guest|cost/i.test(Object.keys(rows[0]).join(",")));

// Variant groups: only when safe.
const pair = (a: string, b: string) => [
  base({ sku: "2001", slug: "v1", colorName: a, variantGroupId: "G1", images: [{ url: OWN.replace("p1", "v1") }] }),
  base({ sku: "2002", slug: "v2", colorName: b, variantGroupId: "G1", images: [{ url: OWN.replace("p1", "v2") }] }),
];
const good = renderChatgptFeed(pair("שחור", "לבן")).body.trim().split("\n").map((l) => JSON.parse(l));
eq("variant fields on both", good.map((r) => [r.group_id, r.listing_has_variations, r.variant_dict]), [["G1", true, { color: "שחור" }], ["G1", true, { color: "לבן" }]]);
const dup = renderChatgptFeed(pair("שחור", "שחור")).body.trim().split("\n").map((l) => JSON.parse(l));
ok("same colour twice: no variant fields", dup.every((r) => r.group_id === undefined && r.variant_dict === undefined));
const lone = renderChatgptFeed([pair("שחור", "לבן")[0]]).body.trim().split("\n").map((l) => JSON.parse(l));
ok("single member: no variant fields", lone[0].group_id === undefined);
const same = renderChatgptFeed([base({ sku: "G1", colorName: "שחור", variantGroupId: "G1" }), base({ sku: "G2", slug: "b", colorName: "לבן", variantGroupId: "G1" })]).body.trim().split("\n").map((l) => JSON.parse(l));
ok("group id equal to an item id: no variant fields", same.every((r) => r.group_id === undefined));

// JSONL hygiene.
const nasty = renderChatgptFeed([base({ title: "שורה\nשנייה עוד", shortDescription: "a\r\nb" })]);
eq("one line per row", nasty.body.split("\n").filter(Boolean).length, 1);
ok("trailing newline", nasty.body.endsWith("\n"));
eq("empty feed is empty", renderChatgptFeed([]).body, "");

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
