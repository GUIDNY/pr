/**
 * The GA4 ecommerce layer, without a browser: the item mapper, the value
 * rule, the dataLayer reset, the consent gate and the cookie parser.
 *
 *   npm run check:ga
 */
export {};
let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}

async function main() {
/* A window with consent granted and GA4's cookies set, as the browser has
   after the banner was accepted and gtag ran. */
const store = new Map<string, string>([["prec-consent", "granted"]]);
const g = globalThis as unknown as Record<string, unknown>;
g.window = g;
g.document = { cookie: "_ga=GA1.1.1234567890.1700000000; _ga_Y2TT301GB2=GS1.1.1760000000.3.1.1760000100.0.0.0; other=x" };
g.localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
Object.defineProperty(g, "navigator", { value: { userAgent: "Mozilla/5.0 test" }, configurable: true });
/* setConsent("denied") reloads the page so the tags really go; here there
   is no page. */
g.location = { reload() {} };

const { pushEcommerce, pushEvent, toAnalyticsItem, itemsValue, readGaIds } = await import("../src/lib/analytics/ga");

console.log("\nthe item");
const item = toAnalyticsItem({ sku: "107012", title: "מקרר", price: 1629, compareAtPrice: 1790, brandName: "Samsung", category: "מקררים וקירור", category2: "מקררים" }, { index: 3, item_list_name: "מקררים" });
is("item_id is the SKU — the feed's g:id", item.item_id, "107012");
is("price is a number, per unit, after discount", item.price, 1629);
is("discount is list minus final", item.discount, 161);
is("category and sub-category", [item.item_category, item.item_category2], ["מקררים וקירור", "מקררים"]);
is("position is 1-based and the list is named", [item.index, item.item_list_name], [3, "מקררים"]);
is("no discount field when there is no discount", "discount" in toAnalyticsItem({ sku: "1", title: "x", price: 100, compareAtPrice: null }), false);
is("no discount field when the list price is not higher", "discount" in toAnalyticsItem({ sku: "1", title: "x", price: 100, compareAtPrice: 100 }), false);
is("quantity defaults to one", toAnalyticsItem({ sku: "1", title: "x", price: 1 }).quantity, 1);
is("value is Σ(price × quantity), to the agora", itemsValue([{ item_id: "a", item_name: "a", price: 10.005, quantity: 3 }, { item_id: "b", item_name: "b", price: 0.1, quantity: 2 }]), 30.22);

console.log("\nthe push");
const dl = (g.dataLayer = [] as unknown[]);
is("a push with consent goes through", pushEcommerce("view_item", { value: 1, items: [item] }), true);
is("…and clears the previous ecommerce object first", dl[0], { ecommerce: null });
is("…then the event, with the currency", (dl[1] as { event: string; ecommerce: { currency: string } }).event + "/" + (dl[1] as { ecommerce: { currency: string } }).ecommerce.currency, "view_item/ILS");
store.set("prec-consent", "denied");
// consent is cached in the module; re-read through the store's own API
const consent = await import("../src/lib/consent");
consent.setConsent("denied");
is("no push without consent", pushEcommerce("purchase", { items: [item] }), false);
is("…and nothing landed in the dataLayer", dl.length, 2);
is("a lead event is gated the same way", pushEvent("phone_click", { page_path: "/x" }), false);
consent.setConsent("granted");
is("a lead event goes through with consent", pushEvent("phone_click", { page_path: "/x" }), true);
is("…as the event with its params and no ecommerce object", dl[dl.length - 1], { event: "phone_click", page_path: "/x" });

console.log("\nGA4's cookies");
is("client id from _ga", readGaIds("G-Y2TT301GB2").clientId, "1234567890.1700000000");
is("session id from the stream cookie", readGaIds("G-Y2TT301GB2").sessionId, "1760000000");
is("another stream's cookie is not read", readGaIds("G-OTHER").sessionId, null);
g.document = { cookie: "" };
is("no cookies, no ids", readGaIds("G-Y2TT301GB2"), { clientId: null, sessionId: null });

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
}

void main();
