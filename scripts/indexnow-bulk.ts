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
// It no longer sends everything every time — see the flags below. The default
// run is what changed this week, capped; the whole-sitemap send is an explicit
// --all for a template change that touched every page.
//
// Reads the live sitemap rather than the database, so it needs no connection
// and no secrets — which also means it can be run from anywhere, by anyone
// who can reach the site.
//
// Run:  npm run indexnow:bulk
//       npm run indexnow:bulk -- --dry-run     (prints and writes the payload,
//                                               sends nothing)
//       npm run indexnow:bulk -- --urls https://…/a,https://…/b
//                                              (exactly these, nothing else —
//                                               no sitemap read, no window,
//                                               no cap: the list IS the
//                                               intent)
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
/* A list named on the command line, for the case this script was otherwise
   wrong for: eleven article URLs after a deploy that changed their markup
   and nothing else. Reading the sitemap would be a round trip to decide
   something already decided, and --since would then drop them, because a
   change to a page's schema does not move its lastmod. So this path skips
   the sitemap, the window and the cap: somebody typed the addresses, which
   is a stronger statement of intent than any of the three. */
const urlsArg = argValue("--urls");
const explicitUrls = (urlsArg ?? "")
  .split(/[,\s]+/)
  .map((u) => u.trim())
  .filter(Boolean);

/* Incremental by default. Bing's own IndexNow page says it in so many
   words — "Avoid IndexNow Batch Mode to prevent excessive server load and
   potential indexing delays" — and the numbers here agreed: 11,400 URLs
   submitted, 150 indexed. A run used to send the whole sitemap plus every
   legacy redirect, 4,176 addresses, whether or not one of them had changed.
   Re-sending unchanged addresses is not a signal, it is noise that delays
   the few that did change.

   So a run sends only URLs whose sitemap <lastmod> moved inside the window
   (--since, days or an ISO date, default 7), newest first, at most --max of
   them (default 500). --all ignores the window for the one case it exists
   for, a template change that altered every page without touching any
   row — and even then the cap holds, so a full resend is spread over days
   by whoever runs it. The legacy redirects are sent only with --legacy:
   once is what a 301 needs, and once has happened. */
const sendAll = process.argv.includes("--all");
const includeLegacy = process.argv.includes("--legacy");
const sinceArg = argValue("--since") ?? "7";
const since = /^\d+(\.\d+)?$/.test(sinceArg) ? Date.now() - Number(sinceArg) * 864e5 : Date.parse(sinceArg);
if (Number.isNaN(since)) {
  console.error(`--since must be a number of days or an ISO date, got ${sinceArg}`);
  process.exit(1);
}
const max = Number(argValue("--max") ?? "500");

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

type SitemapEntry = { url: string; lastmod: number | null };

async function sitemapUrls(): Promise<SitemapEntry[]> {
  if (sitemapFile) {
    // A plain list of URLs, one per line, dated now so --since keeps them.
    return readFileSync(sitemapFile, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((url) => ({ url, lastmod: Date.now() }));
  }
  const res = await fetch(`${SITE}/sitemap.xml`, { headers: { accept: "application/xml" } });
  if (!res.ok) throw new Error(`sitemap.xml returned ${res.status}`);
  const xml = await res.text();
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => {
      const block = m[1];
      const url = block.match(/<loc>([^<]+)<\/loc>/)?.[1].trim() ?? "";
      const mod = block.match(/<lastmod>([^<]+)<\/lastmod>/)?.[1];
      const lastmod = mod ? Date.parse(mod) : null;
      return { url, lastmod: lastmod !== null && Number.isNaN(lastmod) ? null : lastmod };
    })
    .filter((e) => e.url);
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
  if (urlsArg !== null) return sendExplicit();

  let current: SitemapEntry[] = [];
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

  const changed = sendAll ? current : current.filter((e) => e.lastmod !== null && e.lastmod >= since);
  console.log(
    sendAll
      ? "window:   --all, every sitemap url"
      : `window:   ${changed.length} urls changed since ${new Date(since).toISOString().slice(0, 10)}`,
  );
  const ordered = changed.sort((a, b) => (b.lastmod ?? 0) - (a.lastmod ?? 0)).map((e) => e.url);

  const legacy = includeLegacy ? legacyUrls() : [];
  if (includeLegacy) console.log(`redirects: ${legacy.length} urls (--legacy)`);

  // The same address can be in both lists — a product renamed twice has its
  // oldest slug in history and its current one in the sitemap.
  const unique = [...new Set([...ordered, ...legacy])].filter((u) => u.startsWith(SITE));
  const all = unique.slice(0, max);
  const heldBack = unique.length - all.length;
  console.log(`total:    ${all.length} urls to send on ${HOST}${heldBack > 0 ? ` (${heldBack} more held back by --max ${max}; run again tomorrow)` : ""}`);
  if (all.length === 0) {
    console.log("nothing changed in the window — nothing sent");
    return;
  }

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

/** --urls: these addresses, in this order, and nothing added to them. */
async function sendExplicit() {
  const offHost = explicitUrls.filter((u) => !u.startsWith(SITE));
  if (offHost.length > 0) {
    // IndexNow answers 422 for a URL outside the declared host and rejects
    // the whole request with it, so the list is refused here rather than
    // sent and bounced.
    console.error(`not on ${HOST}:\n  ${offHost.join("\n  ")}`);
    process.exit(1);
  }
  const urls = [...new Set(explicitUrls)];
  if (urls.length === 0) {
    console.error("--urls was given nothing to send");
    process.exit(1);
  }
  console.log(`explicit: ${urls.length} urls on ${HOST}`);
  if (dryRun) {
    const out = "indexnow-bulk.json";
    writeFileSync(
      out,
      JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`, urlList: urls }, null, 2),
    );
    console.log(`dry run — wrote ${out}, sent nothing`);
    return;
  }
  if (!(await send(urls))) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
