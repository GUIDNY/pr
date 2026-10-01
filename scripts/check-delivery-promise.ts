/**
 * One delivery promise, everywhere a shopper can read one.
 *
 * `Product.deliveryDays` is 7 on every row in the catalogue, because 7 is the
 * column's schema default and nothing has ever written to it. The shop
 * promises three business days. `deliveryDaysFor()` is what turns the one
 * into the other, and the only bug this family has ever had is a component
 * printing the column instead of calling it.
 *
 * It has happened three times. The structured data said seven while the page
 * said three, on 1,592 products. Then the fix landed on the page's delivery
 * card and the buy block kept the raw column — so the line directly under the
 * price said "תוך 7 ימים" while the paragraph below it said three business
 * days, on every product page, and the compare table said seven too. Each
 * time it was found by a person reading a page, which is a slow and expensive
 * way to find a one-word difference.
 *
 * Nothing in a type can catch it: the right call and the wrong one are both a
 * number. So this reads the source instead, and fails on a rendered
 * `.deliveryDays` in any customer-facing file. The admin form is exempt —
 * editing the column is the one place the raw value belongs.
 *
 *   npm run check:delivery
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  deliveryDaysFor,
  STANDARD_DELIVERY_DAYS,
  HANDLING_DAYS,
  TRANSIT_DAYS,
} from "../src/lib/delivery";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name} → ${got}${ok ? "" : `  (expected ${want})`}`);
}

console.log("The policy itself");
is("an unset 7 becomes the published promise", deliveryDaysFor({ deliveryDays: 7 }), STANDARD_DELIVERY_DAYS);
is("a real number is left alone", deliveryDaysFor({ deliveryDays: 10 }), 10);
/* Google adds the two maximums to produce the estimate it shows, and counts
   both in business days. So their sum is the promise, and anything larger
   advertises a delivery slower than the one the page makes — which is what
   the previous version did, by padding for a weekend that the unit never
   included. */
is(
  "handling + transit equals the published promise",
  HANDLING_DAYS.max + TRANSIT_DAYS.max,
  STANDARD_DELIVERY_DAYS,
);
is("nothing is promised to arrive in zero days", TRANSIT_DAYS.min >= 1, true);
is("handling may be same-day", HANDLING_DAYS.min, 0);

/* Where a shopper reads a delivery time. The admin product form edits the
   column itself, so it is the one file allowed to name it. */
const ROOTS = ["src/app", "src/components", "src/lib"];
const EXEMPT = ["src/components/admin/", "src/lib/delivery.ts", "src/app/admin/"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return walk(path);
    return /\.tsx?$/.test(path) ? [path] : [];
  });
}

console.log("\nNo customer-facing file prints the raw column");
const files = ROOTS.flatMap(walk).filter((f) => !EXEMPT.some((e) => f.startsWith(e)));
const offenders: string[] = [];
for (const file of files) {
  let inBlockComment = false;
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, i) => {
      /* Comments discuss this field at length — this check exists because of
         what went wrong — so they have to be skipped properly rather than by
         looking at the first character of the line. */
      const opens = line.includes("/*");
      const closes = line.includes("*/");
      const wasInComment = inBlockComment;
      if (opens && !closes) inBlockComment = true;
      else if (closes) inBlockComment = false;
      if (wasInComment || opens) return;
      if (/^\s*\/\//.test(line)) return;

      if (!/\.deliveryDays\b/.test(line)) return;
      /* Passing the column along is fine and necessary: something has to
         carry it from the query to the component that calls the helper on
         it. What is never fine is rendering it. */
      if (/^\s*deliveryDays:\s*\w+\.deliveryDays,?\s*$/.test(line)) return;
      offenders.push(`${file}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
}
if (offenders.length === 0) {
  console.log("  ok    every rendered figure goes through deliveryDaysFor()");
} else {
  failures += offenders.length;
  for (const o of offenders) console.log(`  FAIL  ${o}`);
}

console.log(
  failures === 0
    ? "\nThe shop makes one delivery promise.\n"
    : `\n${failures} place(s) disagree about the delivery promise.\n`,
);
process.exit(failures === 0 ? 0 : 1);
