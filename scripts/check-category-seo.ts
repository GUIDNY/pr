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
is("page 1 is the name", categoryPageTitle("מיקרוגלים"), "מיקרוגלים");
is("page 2 says so", categoryPageTitle("מיקרוגלים", 2), "מיקרוגלים – עמוד 2");

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
