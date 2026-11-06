/**
 * npm run check:attribution-ids
 *
 * Two promises from the conversion-tracking spec of 6 November:
 *   - the ad click ids (gclid, gbraid, wbraid, srsltid) survive the trip
 *     from the bt_attr cookie onto Order.attribution. They did not: the
 *     touch schema did not name them, and zod drops keys it does not know,
 *     so all 19 orders since 1 October arrived without one.
 *   - the back office is recognised as such, and nothing else is.
 */
import { attributionFromJson, parseAttribution } from "../src/lib/attribution";
import { isBackOfficePath } from "../src/components/analytics/back-office-analytics-off";

let failed = 0;
const check = (name: string, ok: boolean) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed++;
};

const touch = {
  source: "google",
  medium: "cpc",
  landing: "/category/dryers?gclid=CjwKCAtest",
  at: "2026-11-06T10:00:00.000Z",
  gclid: "CjwKCAtest",
  gbraid: "0AAAAAgbraid",
  wbraid: "CkwKwbraid",
  srsltid: "AfmBOosrsltid",
};
const cookie = encodeURIComponent(JSON.stringify({ first: touch, last: touch }));
const parsed = parseAttribution(cookie);
check("cookie parses", parsed !== null);
for (const k of ["gclid", "gbraid", "wbraid", "srsltid"] as const) {
  check(`first.${k} survives the cookie`, parsed?.first[k] === touch[k]);
  check(`last.${k} survives the cookie`, parsed?.last?.[k] === touch[k]);
}
const stored = attributionFromJson(JSON.parse(JSON.stringify(parsed)));
check("gclid survives the order column", stored?.last?.gclid === "CjwKCAtest");
check("a touch without ids still parses", parseAttribution(encodeURIComponent(JSON.stringify({ first: { source: "direct", medium: "(none)", at: "x" } }))) !== null);
check("an absurd gclid is refused, not stored", parseAttribution(encodeURIComponent(JSON.stringify({ first: { ...touch, gclid: "x".repeat(301) } }))) === null);

for (const [path, want] of [
  ["/admin", true],
  ["/admin/orders", true],
  ["/admin/singles-day", true],
  ["/administrator", false],
  ["/", false],
  ["/product/admin-chair", false],
  ["/checkout", false],
  [null, false],
] as const) {
  check(`isBackOfficePath(${JSON.stringify(path)}) = ${want}`, isBackOfficePath(path) === want);
}

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
