// Run: npx tsx scripts/check-dashboard-trends.ts
import { channelOfOrder, channelOfTouch } from "../src/lib/admin/order-channel";
import { cumulative, dayKeys, pctChange, shiftKey } from "../src/lib/admin/trend-math";
let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failed++; }
};
const t = (source: string, medium: string, extra: object = {}) => ({ source, medium, at: "2026-11-20T10:00:00Z", ...extra });

eq("gclid is paid google", channelOfTouch(t("google", "cpc", { gclid: "abc" })), "google_paid");
eq("gclid wins over organic wording", channelOfTouch(t("google", "organic", { gclid: "abc" })), "google_paid");
eq("cpc without gclid", channelOfTouch(t("google", "cpc")), "google_paid");
eq("shopping listing", channelOfTouch(t("google", "shopping")), "google_paid");
eq("organic google", channelOfTouch(t("google", "organic")), "google_organic");
eq("chatgpt utm", channelOfTouch(t("chatgpt", "shopping")), "ai");
eq("chatgpt referrer", channelOfTouch(t("chatgpt.com", "referral", { referrer: "chatgpt.com" })), "ai");
eq("gemini is AI, not google organic", channelOfTouch(t("google", "organic", { referrer: "gemini.google.com" })), "ai");
eq("perplexity", channelOfTouch(t("perplexity.ai", "referral")), "ai");
eq("instagram", channelOfTouch(t("instagram", "social")), "social");
eq("paid social facebook", channelOfTouch(t("facebook", "paid-social")), "social");
eq("direct", channelOfTouch(t("direct", "(none)")), "direct");
eq("a referral site", channelOfTouch(t("zap", "referral")), "other");
eq("no attribution = direct", channelOfOrder(null, "last"), "direct");
eq("last touch preferred", channelOfOrder({ first: t("direct", "(none)"), last: t("google", "cpc", { gclid: "x" }) }, "last"), "google_paid");
eq("first touch asked for", channelOfOrder({ first: t("direct", "(none)"), last: t("google", "cpc", { gclid: "x" }) }, "first"), "direct");
eq("last falls back to first", channelOfOrder({ first: t("instagram", "social") }, "last"), "social");

eq("pct up", pctChange(150, 100), 50);
eq("pct down", pctChange(50, 100), -50);
eq("pct no base", pctChange(5, 0), null);
eq("pct negative base uses magnitude", pctChange(-50, -100), 50);
eq("cumulative", cumulative([1, -2, 4]), [1, -1, 3]);
eq("dayKeys across month end", dayKeys("2026-12-02", 4), ["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
eq("shiftKey back", shiftKey("2026-03-01", -1), "2026-02-28");
eq("shiftKey over DST", shiftKey("2026-10-26", -1), "2026-10-25");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("OK  dashboard trends");
