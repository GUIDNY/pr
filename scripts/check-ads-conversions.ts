/**
 * npm run check:ads-conversions
 *
 * The parts of lib/analytics/google-ads-conversions.ts that can be wrong
 * without a network: Google's date format with Israel's offset on both sides
 * of the clock change, the row sent for an order, gclid precedence, and the
 * uploader staying off until every credential is present.
 */
import { adsApiConfig, adsDateTime, conversionRow } from "../src/lib/analytics/google-ads-conversions";
import { gclidOf } from "../src/lib/attribution";

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
  conversionRow({ gclid: "CjwK", createdAt: new Date("2026-11-10T12:44:30Z"), total: 1529, orderNumber: "PR-1" }),
  { gclid: "CjwK", conversionDateTime: "2026-11-10 14:44:30+02:00", conversionValue: 1529, currencyCode: "ILS", orderId: "PR-1" },
);

const touch = { source: "google", medium: "cpc", at: "x" };
is("gclid: last touch first", gclidOf({ first: { ...touch, gclid: "A" }, last: { ...touch, gclid: "B" } }), "B");
is("gclid: falls back to first", gclidOf({ first: { ...touch, gclid: "A" }, last: { ...touch } }), "A");
is("gclid: none", gclidOf({ first: touch }), null);
is("gclid: no attribution", gclidOf(null), null);

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
