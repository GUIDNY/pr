// The store's visibility rule exists twice, and the second copy went stale.
//
// `PUBLIC_PRODUCT_WHERE` is a Prisma object; two queries in the same file are
// raw SQL and cannot spread it, so the predicate is also written as
// `PUBLIC_PRODUCT_SQL`. On 19 October the constant learned that a product
// with no stock is still sellable when the price list has not marked it gone.
// The SQL copy was not told, went on asking for `stockQty > 0`, and 1,130 of
// the 2,495 products live on the site could not be found by typing their name
// into the shop's own search box or by asking Alfred — 45% of the catalogue,
// every one of them on a page Google was being shown. The file's own comment
// had predicted it: "there is no compiler to notice."
//
// This is that compiler, as far as a string comparison can be one. It cannot
// tell whether the two mean the same thing; it can tell when one names a
// column the other does not, which is the shape every drift so far has had.
//
// Run: npx tsx scripts/check-public-gate.ts
import { readFileSync } from "node:fs";

const source = readFileSync("src/lib/queries/products.ts", "utf8");

function section(startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start === -1) throw new Error(`could not find ${startMarker} — has the file been restructured?`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (end === -1) throw new Error(`could not find the end of ${startMarker}`);
  return source.slice(start, end);
}

/* The Prisma constant, and the SQL twin. Both are read from the file rather
   than imported, because what is being compared is how each is written. */
const prismaGate = section("export const PUBLIC_PRODUCT_WHERE = {", "\n} as const") +
  section("const SELLABLE_CLAUSE", "];");
const sqlGate = section("const PUBLIC_PRODUCT_SQL = `", "`;");

/* Every condition the rule turns on, as the column each is about. A new
   condition on one side and not the other is the failure this catches. */
const CONDITIONS: [string, { prisma: RegExp; sql: RegExp }][] = [
  ["isPublished", { prisma: /isPublished/, sql: /"isPublished"/ }],
  ["stockQty", { prisma: /stockQty/, sql: /"stockQty"/ }],
  ["sourceAvailability", { prisma: /sourceAvailability/, sql: /"sourceAvailability"/ }],
  ["stockStatus", { prisma: /stockStatus/, sql: /"stockStatus"/ }],
  ["price floor", { prisma: /MIN_PUBLIC_PRICE/, sql: /MIN_PUBLIC_PRICE/ }],
  ["missingFromSourceSince", { prisma: /missingFromSourceSince/, sql: /"missingFromSourceSince"/ }],
  ["images", { prisma: /images/, sql: /"ProductImage"/ }],
  ["source is an active price list", { prisma: /source/, sql: /"InventorySource"/ }],
];

let failed = 0;
for (const [label, { prisma, sql }] of CONDITIONS) {
  const inPrisma = prisma.test(prismaGate);
  const inSql = sql.test(sqlGate);
  if (inPrisma && inSql) continue;
  failed++;
  console.log(
    inPrisma
      ? `FAIL  PUBLIC_PRODUCT_WHERE tests ${label} and PUBLIC_PRODUCT_SQL does not — search and Alfred will not see those products`
      : `FAIL  PUBLIC_PRODUCT_SQL tests ${label} and PUBLIC_PRODUCT_WHERE does not`,
  );
}

/* The specific regression, named. `stockQty > 0` with no alternative beside
   it is the exact text that hid 1,130 products, and it is the thing somebody
   reaches for again when they write the next raw query. */
if (/"stockQty" > 0(?!\s*OR)/.test(sqlGate)) {
  failed++;
  console.log('FAIL  the SQL gate asks for `"stockQty" > 0` with no OR beside it — an orderable product has no stock and is still for sale');
}

/* And there must be exactly one SQL copy. A third would be a third thing to
   forget. */
const rawBlocks = source.match(/WHERE \$\{PUBLIC_PRODUCT_SQL\}/g)?.length ?? 0;
const handRolled = source.match(/WHERE p\."isPublished" AND p\."stockQty"/g)?.length ?? 0;
if (handRolled > 0) {
  failed++;
  console.log(`FAIL  ${handRolled} raw quer(y|ies) still spell the gate out by hand instead of using PUBLIC_PRODUCT_SQL`);
}

const total = CONDITIONS.length + 2;
console.log(
  `${total - failed}/${total} passed  (${CONDITIONS.length} conditions on both sides, ` +
    `${rawBlocks} raw queries sharing one predicate, 0 hand-rolled)`,
);
process.exit(failed === 0 ? 0 : 1);
