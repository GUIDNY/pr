// One-off bulk submission to IndexNow, for after a wave of URL changes.
//
// The per-change pings in lib/indexnow.ts cover the normal day: a sync, an
// admin save, a publish toggle. This is for the other case — a rename that
// moved thousands of addresses at once, where the old ones are now 301s that
// Bing has no reason to re-fetch and the new ones are addresses nobody has
// ever seen.
//
// It sends both halves:
//
//   the current sitemap, which is every canonical URL that answers 200 and is
//   not noindex — the shop's own definition, so this can never drift from it
//
//   every old address in generated/legacy-slugs.ts, on purpose and as the one
//   exception to the rule above. A 301 is exactly what we want Bing to fetch:
//   it is how the signal on the old URL moves to the new one instead of being
//   lost when the old one quietly ages out of the index.
//
// Reads the live sitemap rather than the database, so it needs no connection
// and no secrets — which also means it can be run from anywhere, by anyone
// who can reach the site.
//
// Run:  npm run indexnow:bulk
//       npm run indexnow:bulk -- --dry-run     (prints and writes the payload,
//                                               sends nothing)
//       npm run indexnow:bulk -- --sitemap-file urls.txt
//                                              (one URL per line, for a machine
//                                               that cannot reach the site but
//                                               can reach IndexNow — or the
//                                               reverse, which is how the
//                                               payload gets built here and
//                                               sent from somewhere else)
import { readFileSync, writeFileSync } from "fs";
import { INDEXNOW_KEY } from "../src/lib/indexnow";
import { LEGACY_PRODUCT_SLUGS, LEGACY_BRAND_SLUGS } from "../src/generated/legacy-slugs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") || "https://buytoday.co.il";
const HOST = new URL(SITE).host;
const ENDPOINT = "https://api.indexnow.org/IndexNow";
// IndexNow's own cap for a single request.
const BATCH = 10_000;

const dryRun = process.argv.includes("--dry-run");
const sitemapFile = argValue("--sitemap-file");

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

async function sitemapUrls(): Promise<string[]> {
  if (sitemapFile) {
    return readFileSync(sitemapFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { accept: "application/xml" } });
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function legacyUrls(): string[] {
  return [
    ...Object.keys(LEGACY_PRODUCT_SLUGS).map((slug) => `${SITE}/product/${slug}`),
    ...Object.keys(LEGACY_BRAND_SLUGS).map((slug) => `${SITE}/brand/${slug}`),
  ];
}

async function send(urls: string[]) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    }),
  });
  // 200 and 202 both mean accepted. 400 is a malformed body, 403 means the
  // key file does not match (run `npm run check:indexnow`), 422 means a URL
  // is not on the declared host, 429 means too many requests.
  console.log(`[indexnow] ${res.status} ${res.statusText} for ${urls.length} urls`);
  return res.ok;
}

async function main() {
  let current: string[] = [];
  try {
    current = await sitemapUrls();
    console.log(`sitemap:  ${current.length} urls`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!dryRun) {
      console.error(`could not read ${SITE}/sitemap.xml — ${message}`);
      console.error("Refusing to send only half the list. Fix the fetch and re-run.");
      process.exit(1);
    }
    console.warn(`sitemap:  unavailable (${message}) — dry run continues without it`);
  }

  const legacy = legacyUrls();
  console.log(`redirects: ${legacy.length} urls`);

  // The same address can be in both lists — a product renamed twice has its
  // oldest slug in history and its current one in the sitemap.
  const all = [...new Set([...current, ...legacy])].filter((u) => u.startsWith(SITE));
  console.log(`total:    ${all.length} unique urls on ${HOST}`);

  if (dryRun) {
    const out = "indexnow-bulk.json";
    writeFileSync(
      out,
      JSON.stringify(
        { host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: all },
        null,
        2,
      ),
    );
    console.log(`dry run — wrote ${out}, sent nothing`);
    return;
  }

  let ok = true;
  for (let i = 0; i < all.length; i += BATCH) {
    ok = (await send(all.slice(i, i + BATCH))) && ok;
  }
  if (!ok) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
