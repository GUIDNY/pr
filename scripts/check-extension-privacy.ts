// The extension's privacy policy makes claims about this repository.
//
// /privacy-extension tells a Chrome Web Store reviewer that the price and
// the address of the page you are on never leave your browser, and that
// nothing on our side records which pages you visited. Those are not
// promises about the extension's own code — they are properties of the one
// endpoint it calls, and they hold because /api/price-compare takes two
// parameters and because `api/` is excluded from the first-party path log.
//
// Both are a line of code away from being false, and neither failure shows
// up anywhere: a parameter added while debugging still answers 200, and a
// log that starts covering /api logs quietly. What it costs is a policy
// that misdescribes the product, which is the specific thing the Web Store
// pulls a listing for.
//
// Run: npx tsx scripts/check-extension-privacy.ts
import { readFileSync } from "node:fs";
import { isSkippedPath } from "../src/lib/pageview/capture";
import { EXTENSION_PRIVACY_UPDATED, EXTENSION_PRIVACY_UPDATED_AT } from "../src/lib/content/privacy-extension";

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

const route = readFileSync("src/app/api/price-compare/route.ts", "utf8");
const page = readFileSync("src/app/(shop)/privacy-extension/page.tsx", "utf8");
const proxy = readFileSync("src/proxy.ts", "utf8");
const sitemap = readFileSync("src/app/sitemap.ts", "utf8");

/* 1. The endpoint reads the product's name and a row count. Anything else
      is a field the page says we do not receive — the domain above all,
      which the extension reads locally to decide whether to run at all. */
const params = [...route.matchAll(/searchParams\.get\("([^"]+)"\)/g)].map((m) => m[1]);
const ALLOWED = new Set(["q", "limit"]);
for (const name of params) {
  if (!ALLOWED.has(name)) {
    fail(`/api/price-compare reads "${name}" from the query string — /privacy-extension says only the product's name is sent`);
  }
}
if (!params.includes("q")) fail("/api/price-compare no longer reads `q` — has the endpoint moved?");

/* 2. It stores nothing. A read is fine and there is one (the model lookup);
      a write would be the record the page says does not exist. */
for (const write of ["create(", "createMany(", "update(", "updateMany(", "upsert(", "delete("]) {
  if (route.includes(`.${write}`)) fail(`/api/price-compare calls .${write} — the page says a lookup writes nothing`);
}

/* 3. The path log does not see it, twice over: the proxy's matcher never
      runs for /api, and capture.ts refuses the prefix again for anything
      that slips past. Either one alone would be enough; both are asserted
      because the page's claim rests on whichever survives a refactor. */
if (!isSkippedPath("/api/price-compare")) {
  fail("lib/pageview/capture.ts would log /api/price-compare — the page says no record ties a visitor to the pages they browsed");
}
if (!/\(\?!api\//.test(proxy)) {
  fail("proxy.ts's matcher no longer excludes api/ — a price-compare call would be issued a bt_sid cookie");
}

/* 4. The two dates are the same day. The label is what a reader checks the
      policy's age against and the Date is what the sitemap sends; they are
      written out separately, so nothing but this notices when one moves. */
const MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];
const label = EXTENSION_PRIVACY_UPDATED_AT.match(/^(\d{1,2}) ב(\S+) (\d{4})$/);
if (!label) {
  fail(`EXTENSION_PRIVACY_UPDATED_AT is "${EXTENSION_PRIVACY_UPDATED_AT}" — expected "23 באוקטובר 2026"`);
} else {
  const [, day, month, year] = label;
  const monthIndex = MONTHS.indexOf(month);
  const same =
    monthIndex === EXTENSION_PRIVACY_UPDATED.getUTCMonth() &&
    Number(day) === EXTENSION_PRIVACY_UPDATED.getUTCDate() &&
    Number(year) === EXTENSION_PRIVACY_UPDATED.getUTCFullYear();
  if (!same) {
    fail(
      `the printed date (${EXTENSION_PRIVACY_UPDATED_AT}) and the sitemap's ` +
        `(${EXTENSION_PRIVACY_UPDATED.toISOString().slice(0, 10)}) are different days`,
    );
  }
}

/* 5. The page is in the sitemap and prints the label rather than a date of
      its own. The listing names this URL; an engine that has never been
      offered it is one more way for it to go missing. */
if (!sitemap.includes("/privacy-extension")) fail("sitemap.ts does not list /privacy-extension");
if (!page.includes("EXTENSION_PRIVACY_UPDATED_AT")) {
  fail("the page prints a date that is not EXTENSION_PRIVACY_UPDATED_AT — the sitemap would date it from elsewhere");
}

const total = 5 + params.length;
console.log(
  `${total - failed}/${total} passed  (${params.length} endpoint parameters, writes, ` +
    `the path log's two exclusions, the two dates, the sitemap entry)`,
);
process.exit(failed === 0 ? 0 : 1);
