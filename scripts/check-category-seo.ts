/**
 * What a category page tells a search result about itself.
 *
 * No database: the facts are given, the sentence is checked. Every case is
 * a page that was measured live with the sentence every other category
 * had.
 *
 *   npm run check:category-seo
 */
import { categoryMetaDescription, categoryPageTitle } from "../src/lib/seo/category-description";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}

const microwaves = { count: 60, minPrice: 299, topBrands: ["Samsung", "LG", "Bosch", "Sharp"] };

console.log("\ntitles");
is("page 1 with no facts is the name", categoryPageTitle("מיקרוגלים"), "מיקרוגלים");
is("page 2 says so", categoryPageTitle("מיקרוגלים", 2), "מיקרוגלים – עמוד 2");
/* The live shelves on 15 November, as the pages themselves described them. */
is("page 1 carries the count and the price", categoryPageTitle("מיקרוגלים", 1, { count: 26, minPrice: 1100, topBrands: [] }), "מיקרוגלים – 26 דגמים החל מ-1,100 ₪");
is("a three-digit shelf", categoryPageTitle("מסכי טלוויזיה", 1, { count: 174, minPrice: 400, topBrands: [] }), "מסכי טלוויזיה – 174 דגמים החל מ-400 ₪");
is("page 2 ignores the facts", categoryPageTitle("מיקרוגלים", 2, microwaves), "מיקרוגלים – עמוד 2");
is("no price, count only", categoryPageTitle("אוזניות", 1, { count: 3, minPrice: null, topBrands: [] }), "אוזניות – 3 דגמים");
is("an empty shelf is the name", categoryPageTitle("טאבונים", 1, { count: 0, minPrice: null, topBrands: [] }), "טאבונים");
const longName = "נגני בלוריי, DVD וסטרימרים";
is("a long name keeps the count and drops the price", categoryPageTitle(longName, 1, { count: 12, minPrice: 12990, topBrands: [] }), `${longName} – 12 דגמים`);
is("a very long name stays as it was", categoryPageTitle("מיקרופונים ומערכות אלחוטיות למופעים ולאולמות גדולים", 1, microwaves), "מיקרופונים ומערכות אלחוטיות למופעים ולאולמות גדולים");
for (const [n, f] of [["מיקרוגלים", { count: 26, minPrice: 1100, topBrands: [] }], [longName, { count: 12, minPrice: 12990, topBrands: [] }], ["מקרר 4-5 דלתות", { count: 1390, minPrice: 30000, topBrands: [] }]] as const) {
  is(`"${n}" leaves room for the site name`, categoryPageTitle(n, 1, { ...f, topBrands: [] }).length <= 50, true);
}

console.log("\ndescriptions");
const d1 = categoryMetaDescription("מיקרוגל", microwaves);
is("count, price and three makers", d1, "60 דגמי מיקרוגל במלאי החל מ-299 ₪ — Samsung, LG, Bosch. משלוח עד הבית ואחריות יבואן רשמי.");
is("fits a result", d1.length <= 160, true);
is("page 2 differs from page 1", categoryMetaDescription("מיקרוגל", microwaves, 2) !== d1, true);
is("page 2 names the page", categoryMetaDescription("מיקרוגל", microwaves, 2).endsWith("עמוד 2."), true);
is("no price when none", categoryMetaDescription("אוזניות", { count: 2, minPrice: null, topBrands: ["Sony"] }), "2 דגמי אוזניות במלאי — Sony. משלוח עד הבית ואחריות יבואן רשמי.");
is("empty shelf still says something", categoryMetaDescription("טאבונים", { count: 0, minPrice: null, topBrands: [] }), "טאבונים ב-Buy Today. משלוח עד הבית ואחריות יבואן רשמי.");
const long = categoryMetaDescription("מקררים ומקפיאים אינטגרליים לבית ולמשרד", { count: 1234, minPrice: 12345, topBrands: ["Schaub Lorenz International", "Fratelli Onofri Deluxe", "Morphy Richards Professional"] });
is("a long one drops the tail rather than overflow", long.length <= 160, true);
is("…but keeps the facts", long.startsWith("1,234 דגמי"), true);
is("price is formatted with a thousands separator", categoryMetaDescription("x", { count: 1, minPrice: 1990, topBrands: [] }).includes("1,990 ₪"), true);

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
