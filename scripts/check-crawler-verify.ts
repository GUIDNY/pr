// Is the crawler in the log the crawler it says it is?
//
// Every address below is a real one out of `CrawlerHit`, and every prefix
// is copied from the vendor's own published file. The founding cases are
// the first six hours of the log, in which the report said Storebot-Google
// had visited ten times and Googlebot-Image ten times and OAI-SearchBot
// eleven. The true numbers were nought, nought and one: the rest came from
// 160.79.106.x, a cloud container running the probe that proved the
// logging worked, with the agent string typed in by hand. This file exists
// so that nobody reads those rows as traffic again.
//
// The second founding case is the opposite one, and it is why `false` has
// to be reachable at all: a ChatGPT-User row from 88.223.223.251, an
// address in no OpenAI list, among sixteen genuine ones.
//
// The third is the error that would be worse than either — a real crawler
// called a forgery. Three of the tests below exist only to prove a vendor
// whose file could not be read comes back `null` rather than `false`.
//
// Run: npx tsx scripts/check-crawler-verify.ts
//      npx tsx scripts/check-crawler-verify.ts --live   (also asks the vendors)
import {
  CRAWLER_RANGE_SOURCES,
  CRAWLER_VENDORS,
  CRAWLER_VENDOR_KEYS,
  VERIFIABLE_CRAWLERS,
  classifyCrawlerIp,
  ipInAnyPrefix,
  parseAddress,
  parsePrefix,
  parseRangeDocument,
  prefixContains,
} from "../src/lib/pageview/crawler-ranges";
import { CRAWLER_NAMES, matchCrawler } from "../src/lib/pageview/crawlers";

let failed = 0;
let checked = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};
const expect = (label: string, actual: unknown, wanted: unknown) => {
  checked++;
  if (actual !== wanted) fail(`${label}: got ${String(actual)}, wanted ${String(wanted)}`);
};

/* ── the fixture ranges ──────────────────────────────────────────────────
   Real prefixes, each the one that actually covers the address it is here
   for. Trimmed to what the cases need: the point of the fixture is that it
   is offline and deterministic, so that a vendor having a bad morning can
   never be the reason this guard goes red. `--live` is where the real
   files get asked. */
const RANGES = new Map<string, readonly string[]>([
  [
    "google",
    [
      "66.249.65.160/27", // the real Googlebot in the log
      "66.249.64.0/19",
      "2001:4860:4801:10::/64", // and its IPv6, from the same file
      "216.239.33.96/27",
    ],
  ],
  [
    "openai",
    [
      "74.7.229.128/25", // OAI-SearchBot, the one true arrival
      "9.129.0.0/16", // ChatGPT-User
      "20.199.211.160/28", // ChatGPT-User
      "104.210.140.128/28",
    ],
  ],
  ["perplexity", ["18.97.9.96/29", "18.97.1.228/30", "107.20.236.150/32"]],
  ["bing", ["40.77.167.0/24", "157.55.39.0/24"]],
  ["ahrefs", ["51.81.103.248/32", "54.36.148.1/32"]],
]);

/* ── the log's own rows ──────────────────────────────────────────────────
   [bot, address, verdict, why]. */
const CASES: [string, string | null, boolean | null, string][] = [
  // Real, and in the vendor's list.
  ["Googlebot", "66.249.65.162", true, "the Googlebot that is really crawling the shop"],
  ["Googlebot", "66.249.65.161", true, "same crawler, second address"],
  ["Googlebot", "2001:4860:4801:10::1", true, "Googlebot over IPv6"],
  ["OAI-SearchBot", "74.7.229.167", true, "the one real OAI-SearchBot arrival"],
  ["ChatGPT-User", "9.129.53.154", true, "ChatGPT fetching a page for somebody"],
  ["ChatGPT-User", "20.199.211.170", true, "same, second range"],
  ["PerplexityBot", "18.97.9.101", true, "Perplexity, 57 rows and all of them real"],
  ["bingbot", "40.77.167.149", true, "bingbot"],
  ["AhrefsBot", "51.81.103.248", true, "Ahrefs, from its own published list"],

  // Our own probe traffic, wearing four different names. THE FOUNDING CASE.
  ["Googlebot", "160.79.106.129", false, "our probe calling itself Googlebot"],
  ["Googlebot", "160.79.106.18", false, "ditto, a second container address"],
  ["Googlebot-Image", "160.79.106.19", false, "all ten Googlebot-Image rows were this"],
  ["Storebot-Google", "160.79.106.130", false, "all ten Storebot-Google rows were this"],
  ["OAI-SearchBot", "160.79.106.131", false, "eleven of the twelve OAI-SearchBot rows"],

  // Somebody else's forgery.
  ["ChatGPT-User", "88.223.223.251", false, "a ChatGPT-User in no OpenAI range"],

  // Nobody to ask. Not false — these vendors publish nothing fetchable.
  ["Amazonbot", "18.205.127.11", null, "Amazon documents reverse DNS, not a list"],
  ["facebookexternalhit", "2.52.20.22", null, "Meta publishes no fetchable list"],
  ["HeadlessChrome", "13.57.148.235", null, "a headless browser has no vendor at all"],
  ["ClaudeBot", "160.79.106.1", null, "Anthropic publishes no list either"],
  ["YandexBot", "5.255.255.5", null, "reverse DNS again"],

  // No address to read. Also not false.
  ["Googlebot", null, null, "a row whose x-forwarded-for was missing"],
  ["Googlebot", "", null, "an empty address"],
  ["Googlebot", "not-an-address", null, "junk in the header"],
  ["Googlebot", "66.249.65", null, "a truncated address decides nothing"],
];

for (const [bot, ip, wanted, why] of CASES) {
  expect(`${bot} @ ${ip ?? "(none)"} — ${why}`, classifyCrawlerIp(bot, ip, RANGES), wanted);
}

/* ── a vendor we could not reach is a vendor we do not accuse ────────────
   The single most important property here. `loadCrawlerRanges` drops a
   vendor whose file failed, so the map simply lacks it — and the verdict
   for its crawlers has to be null, or one bad morning at Google would
   rewrite every Googlebot row in the table to `false`. */
const WITHOUT_GOOGLE = new Map([...RANGES].filter(([vendor]) => vendor !== "google"));
expect("Googlebot with Google's file unread", classifyCrawlerIp("Googlebot", "66.249.65.162", WITHOUT_GOOGLE), null);
expect(
  "our probe with Google's file unread",
  classifyCrawlerIp("Googlebot", "160.79.106.129", WITHOUT_GOOGLE),
  null,
);
expect("the others still decided", classifyCrawlerIp("bingbot", "40.77.167.149", WITHOUT_GOOGLE), true);

/* An empty list is the same situation: a file that parsed to nothing is a
   file we did not understand, not a vendor with no crawlers. */
const EMPTY_GOOGLE = new Map([...RANGES, ["google", [] as readonly string[]]]);
expect("Googlebot against an empty list", classifyCrawlerIp("Googlebot", "66.249.65.162", EMPTY_GOOGLE), null);
expect("and no false either", classifyCrawlerIp("Googlebot", "160.79.106.129", EMPTY_GOOGLE), null);

/* ── addresses ───────────────────────────────────────────────────────── */
const ADDRESSES: [string, boolean][] = [
  ["66.249.65.162", true],
  ["0.0.0.0", true],
  ["255.255.255.255", true],
  ["2001:4860:4801:10::1", true],
  ["::1", true],
  ["::", true],
  ["2001:db8::ffff:1.2.3.4", true],
  ["::ffff:66.249.65.162", true],
  ["[2001:4860:4801:10::1]", true],
  ["256.1.1.1", false],
  ["1.2.3", false],
  ["1.2.3.4.5", false],
  ["1.2.3.4a", false],
  ["", false],
  ["   ", false],
  ["gggg::1", false],
  ["1::2::3", false],
  ["12345::1", false],
  ["1:2:3:4:5:6:7", false], // no `::`, so all eight must be written
  ["1:2:3:4:5:6:7:8:9", false],
];
for (const [text, ok] of ADDRESSES) expect(`parseAddress(${JSON.stringify(text)})`, parseAddress(text) !== null, ok);

/* The mapped form has to compare equal to the plain one, or every hit
   behind a proxy that writes it that way reads as a forgery. */
expect(
  "::ffff: form matches the v4 prefix",
  prefixContains("66.249.65.160/27", "::ffff:66.249.65.162"),
  true,
);
expect("and is still bounded", prefixContains("66.249.65.160/27", "::ffff:66.249.65.200"), false);

/* ── prefixes ────────────────────────────────────────────────────────── */
expect("the /27 holds its own range", prefixContains("66.249.65.160/27", "66.249.65.191"), true);
expect("and stops at the edge", prefixContains("66.249.65.160/27", "66.249.65.192"), false);
expect("and below it", prefixContains("66.249.65.160/27", "66.249.65.159"), false);
expect("a /32 is one address", prefixContains("51.81.103.248/32", "51.81.103.248"), true);
expect("a /32 is only that one", prefixContains("51.81.103.248/32", "51.81.103.249"), false);
expect("a bare address means /32", prefixContains("51.81.103.248", "51.81.103.248"), true);
expect("a bare address excludes its neighbour", prefixContains("51.81.103.248", "51.81.103.247"), false);
expect("host bits in the prefix are dropped", prefixContains("66.249.65.162/27", "66.249.65.160"), true);
expect("/0 holds everything v4", prefixContains("0.0.0.0/0", "8.8.8.8"), true);
expect("v6 prefix, v4 address", prefixContains("2001:4860:4801:10::/64", "66.249.65.162"), false);
expect("v4 prefix, v6 address", prefixContains("66.249.65.160/27", "2001:4860:4801:10::1"), false);
/* The two that actually discriminate, and the reason the width check in
   `prefixContains` is a line of its own rather than something the
   arithmetic takes care of: with it removed, a /0 of either family
   swallows the whole of the other, and the pair above still passes. */
expect("a v4 /0 does not hold v6", prefixContains("0.0.0.0/0", "2001:db8::1"), false);
expect("a v6 /0 does not hold v4", prefixContains("::/0", "66.249.65.162"), false);
expect("/0 holds everything v6", prefixContains("::/0", "2001:db8::1"), true);
expect("the /64 holds its range", prefixContains("2001:4860:4801:10::/64", "2001:4860:4801:10:ffff::9"), true);
expect("and stops", prefixContains("2001:4860:4801:10::/64", "2001:4860:4801:11::1"), false);
expect("a junk prefix matches nothing", prefixContains("not-a-prefix/24", "1.2.3.4"), false);
expect("a junk length matches nothing", prefixContains("1.2.3.0/abc", "1.2.3.4"), false);
expect("an over-long length is refused", parsePrefix("1.2.3.0/33"), null);
expect("an over-long v6 length is refused", parsePrefix("2001:db8::/129"), null);
expect("ipInAnyPrefix finds it", ipInAnyPrefix(RANGES.get("google")!, "66.249.65.162"), true);
expect("ipInAnyPrefix misses it", ipInAnyPrefix(RANGES.get("google")!, "160.79.106.129"), false);
expect("ipInAnyPrefix over nothing", ipInAnyPrefix([], "66.249.65.162"), false);

/* ── the vendors' file shapes ────────────────────────────────────────── */
const GOOGLE_DOC = {
  creationTime: "2026-10-23T14:45:59.000000",
  prefixes: [{ ipv6Prefix: "2001:4860:4801:10::/64" }, { ipv4Prefix: "66.249.65.160/27" }],
};
expect("both key spellings are read", parseRangeDocument("prefixes", GOOGLE_DOC).length, 2);
expect("ahrefs' own shape", parseRangeDocument("bare-ips", { ips: [{ ip_address: "51.81.103.248" }] }).length, 1);

/* Everything that is not the file we asked for comes back empty, so that
   `loadCrawlerRanges` treats it as a vendor to skip. A login page, a
   rename, a shape change and an outage all land here. */
const JUNK: unknown[] = [
  null,
  undefined,
  "<!doctype html><title>Sign in</title>",
  42,
  {},
  { prefixes: "nope" },
  { prefixes: [{}, { somethingElse: "1.2.3.0/24" }, null, "1.2.3.0/24"] },
  { ips: [{ no_address: "x" }, null] },
];
for (const body of JUNK) {
  expect(`junk as prefixes: ${JSON.stringify(body)?.slice(0, 40)}`, parseRangeDocument("prefixes", body).length, 0);
  expect(`junk as bare-ips: ${JSON.stringify(body)?.slice(0, 40)}`, parseRangeDocument("bare-ips", body).length, 0);
}
/* The one shape that must NOT cross over: Ahrefs' file read as prefixes,
   and Google's read as bare addresses. Either would silently empty a
   vendor, which `loadCrawlerRanges` then reports as a failure — fine — but
   quietly returning one usable prefix out of the wrong reader would not be. */
expect("google's file is not bare-ips", parseRangeDocument("bare-ips", GOOGLE_DOC).length, 0);
expect("ahrefs' file is not prefixes", parseRangeDocument("prefixes", { ips: [{ ip_address: "1.2.3.4" }] }).length, 0);

/* ── the registry hangs together ─────────────────────────────────────── */
for (const bot of VERIFIABLE_CRAWLERS) {
  checked++;
  if (!CRAWLER_NAMES.includes(bot)) {
    fail(`${bot} has a vendor but is not a name matchCrawler can produce — it would never be selected`);
  }
}
for (const vendor of CRAWLER_VENDOR_KEYS) {
  checked++;
  if (!CRAWLER_RANGE_SOURCES.some((s) => s.vendor === vendor)) {
    fail(`vendor ${vendor} is claimed by a crawler but has no source to read`);
  }
}
for (const source of CRAWLER_RANGE_SOURCES) {
  checked++;
  if (!CRAWLER_VENDOR_KEYS.includes(source.vendor)) {
    fail(`source ${source.url} belongs to vendor ${source.vendor}, which no crawler names`);
  }
  checked++;
  if (!source.url.startsWith("https://")) fail(`source ${source.url} is not https`);
}
/* Every fixture vendor must be a real one, or the cases above are testing
   a map the code never builds. */
for (const vendor of RANGES.keys()) {
  checked++;
  if (!CRAWLER_VENDOR_KEYS.includes(vendor)) fail(`fixture vendor ${vendor} is not in the registry`);
}
for (const vendor of CRAWLER_VENDOR_KEYS) {
  checked++;
  if (!RANGES.has(vendor)) fail(`vendor ${vendor} has no fixture, so nothing here tests it`);
}
/* The agent strings in the log must still resolve to the names the vendor
   map is keyed by — the two files have to agree or verification silently
   stops applying to whichever name drifted. */
const AGENT_NAMES: [string, string][] = [
  ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot"],
  ["Googlebot-Image/1.0", "Googlebot-Image"],
  ["Mozilla/5.0 (compatible; Storebot-Google/1.0; +http://www.google.com/bot.html)", "Storebot-Google"],
  ["Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", "OAI-SearchBot"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "ChatGPT-User"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "PerplexityBot"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm) Chrome/116.0.1938.76 Safari/537.36", "bingbot"],
  ["Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)", "AhrefsBot"],
];
for (const [agent, name] of AGENT_NAMES) {
  expect(`the logged agent still names ${name}`, matchCrawler(agent), name);
  checked++;
  if (!CRAWLER_VENDORS[name]) fail(`${name} is logged but has no vendor, so it can never be verified`);
}

/* ── optional: ask the vendors ───────────────────────────────────────── */
async function live() {
  const { loadCrawlerRanges } = await import("../src/lib/pageview/crawler-verify.server");
  const { ranges, loaded, failures } = await loadCrawlerRanges();
  console.log(`\nlive: ${loaded.length}/${CRAWLER_VENDOR_KEYS.length} vendors read` + (failures.length ? ` — ${failures.map((f) => `${f.url} (${f.reason})`).join(", ")}` : ""));
  for (const [vendor, prefixes] of ranges) console.log(`  ${vendor}: ${prefixes.length} prefixes`);
  /* The same founding cases, against the files as they stand today. A
     vendor we could not read is skipped rather than failed — the point of
     `--live` is to catch a moved URL, not to depend on five uptimes. */
  for (const [bot, ip, wanted, why] of CASES) {
    const vendor = CRAWLER_VENDORS[bot];
    if (!vendor || !ranges.has(vendor) || wanted === null) continue;
    const got = classifyCrawlerIp(bot, ip, ranges);
    if (got !== wanted) fail(`live ${bot} @ ${ip} — ${why}: got ${String(got)}, wanted ${String(wanted)}`);
    checked++;
  }
}

const run = process.argv.includes("--live") ? live() : Promise.resolve();
run.then(() => {
  console.log(
    `${checked - failed}/${checked} passed  (${CASES.length} real log rows judged, ` +
      `${VERIFIABLE_CRAWLERS.length} crawlers verifiable across ${CRAWLER_VENDOR_KEYS.length} vendors, ` +
      `${CRAWLER_RANGE_SOURCES.length} published files)`,
  );
  process.exit(failed === 0 ? 0 : 1);
});
