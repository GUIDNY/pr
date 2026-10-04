/**
 * A sheet's spelling of a manufacturer lands on the row that exists.
 *
 * Every case is a Brand row the import actually created — Hebrew name, hash
 * slug — from a name that already had a Latin row. See
 * lib/catalog/brand-aliases.ts for why. No database.
 *
 *   npm run check:brand-aliases
 */
import { canonicalBrandName, brandKey } from "../src/lib/catalog/brand-aliases";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}

const CASES: [string, string][] = [
  ["בוש", "Bosch"],
  ["סאוטר", "Sauter"],
  ["סאווטר", "Sauter"],
  ["גורניה  י.שלום", "Gorenje"],
  ["גורניה", "Gorenje"],
  ["שאוב לורנס", "Schaub Lorenz"],
  ["שאובלורנס", "Schaub Lorenz"],
  ["מורפי ריצארד", "Morphy Richards"],
  ["מורפי ריצ'ארד", "Morphy Richards"],
  ["פראטלי", "Fratelli"],
  ["פריימיר", "Premier"],
  ["לנקו", "Lenco"],
  ["האייר", "Haier"],
  ["סמסונג", "Samsung"],
  ["  Bosch ", "Bosch"],
  ["Hyundai", "Hyundai"],
  ["טורנדו", "טורנדו"],
  ["Some New Maker", "Some New Maker"],
];
for (const [raw, want] of CASES) is(`${JSON.stringify(raw)} → ${want}`, canonicalBrandName(raw), want);

is("key ignores quotes and spacing", brandKey("מורפי  ריצ'ארד"), brandKey("מורפי ריצארד"));
is("key folds case", brandKey("SMEG"), brandKey("smeg"));

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
