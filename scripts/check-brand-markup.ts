/**
 * npm run check:brand-markup
 *
 * Frigidaire is always the price list plus 200 (owner, 8 November). The
 * pure half of the rule, without a database: the table says so, the markup
 * is added to the sheet's number and nothing else, and a missing price
 * stays missing rather than becoming 200 ₪.
 */
import { BRAND_PRICE_MARKUP, withMarkup } from "../src/lib/inventory/brand-markup";

let failed = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

is("Frigidaire (פריגידר) carries 200", BRAND_PRICE_MARKUP["פריגידר"], 200);
is("no other brand is marked up", Object.keys(BRAND_PRICE_MARKUP), ["פריגידר"]);
is("4,000 on the sheet is 4,200 on the site", withMarkup(4000, 200), 4200);
is("8,000 on the sheet is 8,200 on the site", withMarkup(8000, 200), 8200);
is("the supplier lowers to 7,500 — the site follows to 7,700", withMarkup(7500, 200), 7700);
is("no price on the row stays no price, never 200 ₪", withMarkup(null, 200), null);
is("a brand with no markup is the sheet's own number", withMarkup(4000, 0), 4000);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
