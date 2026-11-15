/**
 * npm run check:ads-conversions
 *
 * The parts of lib/analytics/google-ads-conversions.ts that can be wrong
 * without a network: Google's date format with Israel's offset on both sides
 * of the clock change, the row sent for an order, gclid precedence, and the
 * uploader staying off until every credential is present.
 */
import { adsApiConfig, adsDateTime, conversionRow, pendingConversionWhere } from "../src/lib/analytics/google-ads-conversions";
import { adClickOf, gclidOf } from "../src/lib/attribution";

let failed = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

is("winter: +02:00", adsDateTime(new Date("2026-11-10T12:44:30Z")), "2026-11-10 14:44:30+02:00");
is("summer: +03:00", adsDateTime(new Date("2026-07-01T09:00:00Z")), "2026-07-01 12:00:00+03:00");
is("midnight is 00, not 24", adsDateTime(new Date("2026-11-10T22:00:05Z")), "2026-11-11 00:00:05+02:00");

is(
  "row",
  conversionRow({ click: { gclid: "CjwK" }, createdAt: new Date("2026-11-10T12:44:30Z"), total: 1529, orderNumber: "PR-1" }),
  { gclid: "CjwK", conversionDateTime: "2026-11-10 14:44:30+02:00", conversionValue: 1529, currencyCode: "ILS", orderId: "PR-1" },
);

const touch = { source: "google", medium: "cpc", at: "x" };
is("gclid: last touch first", gclidOf({ first: { ...touch, gclid: "A" }, last: { ...touch, gclid: "B" } }), "B");
is("gclid: falls back to first", gclidOf({ first: { ...touch, gclid: "A" }, last: { ...touch } }), "A");
is("gclid: none", gclidOf({ first: touch }), null);
is("gclid: no attribution", gclidOf(null), null);

/* The click a sale is reported against. An ad click from an iPhone often has
   a gbraid or a wbraid and no gclid, and until this was written such an
   order was never reported at all. */
const direct = { source: "direct", medium: "(none)", at: "x" };
is("click: the gclid column wins", adClickOf("COL", { first: { ...touch, gbraid: "G" } }), { gclid: "COL" });
is("click: gbraid on the last touch", adClickOf(null, { first: direct, last: { ...touch, gbraid: "G" } }), { gbraid: "G" });
is("click: wbraid on the first touch", adClickOf(null, { first: { ...touch, wbraid: "W" } }), { wbraid: "W" });
is("click: the most recent touch first", adClickOf(null, { first: { ...touch, wbraid: "OLD" }, last: { ...touch, gbraid: "NEW" } }), { gbraid: "NEW" });
is("click: one id, never two", adClickOf(null, { first: { ...touch, gbraid: "G", wbraid: "W" } }), { gbraid: "G" });
is("click: srsltid is a free listing, not an ad click", adClickOf(null, { first: { source: "google", medium: "shopping", at: "x", srsltid: "S" } }), null);
is("click: none", adClickOf(null, { first: direct }), null);
is("click: no attribution", adClickOf(null, null), null);
is("click: a malformed attribution is not a reason to throw", adClickOf(null, "not json"), null);
is(
  "row: a gbraid goes out under its own name, with no gclid key",
  conversionRow({ click: { gbraid: "G" }, createdAt: new Date("2026-11-10T12:44:30Z"), total: 250, orderNumber: "PR-2" }),
  { gbraid: "G", conversionDateTime: "2026-11-10 14:44:30+02:00", conversionValue: 250, currencyCode: "ILS", orderId: "PR-2" },
);
/* The click-id condition must not be a top-level OR: the uploader spreads
   this beside its own keys, and a spread replaces a key of the same name. */
const where = pendingConversionWhere(new Date("2026-11-15T00:00:00Z")) as Record<string, unknown>;
is("where: no top-level OR to be clobbered", "OR" in where, false);
is("where: gclid column or a braid on either touch", JSON.stringify(where.AND).match(/gclid|gbraid|wbraid/g)?.sort(), ["gbraid", "gbraid", "gclid", "wbraid", "wbraid"]);

for (const k of Object.keys(process.env)) if (k.startsWith("GOOGLE_ADS_")) delete process.env[k];
is("off with no credentials", adsApiConfig(), null);
Object.assign(process.env, {
  GOOGLE_ADS_DEVELOPER_TOKEN: "d",
  GOOGLE_ADS_CLIENT_ID: "c",
  GOOGLE_ADS_CLIENT_SECRET: "s",
  GOOGLE_ADS_REFRESH_TOKEN: "r",
});
is("off without the conversion action", adsApiConfig(), null);
process.env.GOOGLE_ADS_PURCHASE_ACTION_ID = "123";
is("on with all of them; customer defaults", adsApiConfig()?.customerId, "1547232645");
is("login customer optional", adsApiConfig()?.loginCustomerId, null);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall ok");
