/**
 * Is the crawler in the log the crawler it says it is?
 *
 * The user agent is a free-text header. Anyone can send
 * `Googlebot/2.1`, and the crawler log believed every one of them for its
 * first six hours — which is how it came to report, in this file's own
 * first draft of the numbers, that **Storebot-Google had visited ten
 * times**. It had not visited at all. Those ten rows, and ten of the
 * Googlebot-Image rows, and eleven of the twelve OAI-SearchBot rows, came
 * from 160.79.106.x — a cloud container running the probe that proved the
 * logging worked, with the agent string set by hand. The one real
 * OAI-SearchBot arrival in that window came from 74.7.229.167, which is in
 * OpenAI's published list, and it was the twelfth row rather than the
 * headline.
 *
 * So the agent string says what to *look up*, and the address says whether
 * to believe it. Every vendor whose crawler matters here publishes the
 * addresses it crawls from, as a JSON file on a URL they control, and
 * `verified` on a `CrawlerHit` is the answer to exactly one question: was
 * this request's address in the list its claimed vendor publishes.
 *
 * Also caught in those six hours, which is the other half of why this
 * exists: one `ChatGPT-User` row from 88.223.223.251, an address in no
 * OpenAI list, with its parentheses in the wrong place against the sixteen
 * genuine ones. A thing worth doing turned up work on its first day.
 *
 * THE DECISION THIS FILE MAKES, and the one it refuses to:
 *
 *   true   — the address is in a list the claimed vendor publishes.
 *   false  — the vendor publishes a list, and this address is not in it.
 *   null   — nobody to ask. No published list for this crawler, so the
 *            claim is neither confirmed nor refuted and must not be
 *            rendered as either.
 *
 * `null` is load-bearing and is not a shrug: Amazonbot, facebookexternalhit
 * and the monitoring agents publish nothing fetchable, and a column that
 * guessed `false` for them would turn 91 honest rows into an impersonation
 * report. A fetch that *fails* is also null — see crawler-verify.server.ts,
 * where a vendor whose file could not be read is skipped rather than
 * disbelieved. An outage at Google is not a forgery.
 *
 * MATCHED PER VENDOR, NOT PER CRAWLER, deliberately. Google splits its
 * ranges over three files by product and OpenAI over three by crawler, and
 * the shop's question is "is this really Google" rather than "is this the
 * exact Google product the header names". Checking Googlebot against only
 * `common-crawlers.json` would read a vendor's own re-shuffle between their
 * files as a forgery, and a false accusation against a real crawler is the
 * expensive error here: it is the one that gets a genuine arrival ignored.
 */

/** How a vendor's file is shaped. Two shapes cover all five. */
export type RangeShape = "prefixes" | "bare-ips";

export type CrawlerRangeSource = {
  /** Who. Several files can belong to one vendor and are unioned. */
  readonly vendor: string;
  readonly url: string;
  readonly shape: RangeShape;
};

/**
 * The published lists.
 *
 * Google's three moved: the documented
 * `/search/apis/ipranges/googlebot.json` now 301s to
 * `/crawling/ipranges/common-crawlers.json`, so the new paths are the ones
 * here and a 301 is followed anyway.
 */
export const CRAWLER_RANGE_SOURCES: readonly CrawlerRangeSource[] = [
  {
    vendor: "google",
    url: "https://developers.google.com/static/crawling/ipranges/common-crawlers.json",
    shape: "prefixes",
  },
  {
    vendor: "google",
    url: "https://developers.google.com/static/crawling/ipranges/special-crawlers.json",
    shape: "prefixes",
  },
  {
    vendor: "google",
    url: "https://developers.google.com/static/crawling/ipranges/user-triggered-fetchers.json",
    shape: "prefixes",
  },
  { vendor: "openai", url: "https://openai.com/searchbot.json", shape: "prefixes" },
  { vendor: "openai", url: "https://openai.com/chatgpt-user.json", shape: "prefixes" },
  { vendor: "openai", url: "https://openai.com/gptbot.json", shape: "prefixes" },
  { vendor: "perplexity", url: "https://www.perplexity.ai/perplexitybot.json", shape: "prefixes" },
  { vendor: "bing", url: "https://www.bing.com/toolbox/bingbot.json", shape: "prefixes" },
  /* Bare addresses rather than prefixes, and 10,350 of them. Ahrefs is
     here because it is loud — 13 rows in six hours, on 13 different
     addresses — and a loud crawler nobody can place is the one somebody
     ends up blocking by guess. */
  { vendor: "ahrefs", url: "https://api.ahrefs.com/v3/public/crawler-ips", shape: "bare-ips" },
];

/**
 * Crawler name (as `matchCrawler` stores it) → the vendor to ask about it.
 *
 * A name absent from here has no published list and stays `null` forever.
 * That is a statement about the vendor, not about the crawler: Amazon and
 * Meta document reverse DNS instead, which is a different lookup and a
 * different failure mode, and is not what this file does.
 */
export const CRAWLER_VENDORS: Readonly<Record<string, string>> = {
  // OpenAI
  "OAI-SearchBot": "openai",
  "ChatGPT-User": "openai",
  GPTBot: "openai",
  // Google. Every name the matcher can produce for them, so that a Google
  // crawler is never read as unplaceable merely because it is a niche one.
  Googlebot: "google",
  "Googlebot-Image": "google",
  "Storebot-Google": "google",
  "Google-InspectionTool": "google",
  "Google-Extended": "google",
  "AdsBot-Google": "google",
  "Mediapartners-Google": "google",
  // Perplexity
  PerplexityBot: "perplexity",
  "Perplexity-User": "perplexity",
  // Microsoft
  bingbot: "bing",
  BingPreview: "bing",
  // SEO tooling
  AhrefsBot: "ahrefs",
};

/** The crawler names this can decide anything about. */
export const VERIFIABLE_CRAWLERS: readonly string[] = Object.keys(CRAWLER_VENDORS);

/** Every vendor named above, each of which must have at least one source. */
export const CRAWLER_VENDOR_KEYS: readonly string[] = [
  ...new Set(Object.values(CRAWLER_VENDORS)),
];

/**
 * Pull the addresses out of one vendor's file.
 *
 * Returns [] rather than throwing on anything unexpected, because the
 * caller's next move is "skip this vendor this run", and a parse error and
 * an empty file want the same handling. A vendor that answered with a
 * login page must not become a vendor whose crawlers are all forgeries —
 * see `loadCrawlerRanges`, which refuses to use an empty result.
 */
export function parseRangeDocument(shape: RangeShape, body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const doc = body as Record<string, unknown>;
  if (shape === "bare-ips") {
    const ips = doc.ips;
    if (!Array.isArray(ips)) return [];
    return ips
      .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>).ip_address : null))
      .filter((v): v is string => typeof v === "string" && v.length > 0);
  }
  const prefixes = doc.prefixes;
  if (!Array.isArray(prefixes)) return [];
  const out: string[] = [];
  for (const entry of prefixes) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as Record<string, unknown>;
    const value = row.ipv4Prefix ?? row.ipv6Prefix;
    if (typeof value === "string" && value.length > 0) out.push(value);
  }
  return out;
}

/* ─── address arithmetic ───────────────────────────────────────────────── */

/**
 * An address as its bytes — four of them, or sixteen.
 *
 * Bytes rather than one big number on purpose: `tsconfig` targets ES2017,
 * where BigInt literals are not available, and a 32-bit address does not
 * fit a signed shift without care. Comparing bytes needs neither, and the
 * prefix test below reads as what it is.
 */
type Address = { bytes: number[] };

/**
 * One address, or null.
 *
 * Null for everything malformed, and never a throw: the input is whatever
 * a proxy put in `x-forwarded-for`, so "unparseable" is an ordinary
 * Tuesday and not an exception. A row whose address cannot be read is a
 * row with nothing to say, which is `null`, not `false`.
 */
export function parseAddress(input: string | null | undefined): Address | null {
  if (!input) return null;
  const raw = input.trim();
  if (!raw || raw.length > 45) return null;
  /* A bracketed address, as some proxies write a v6 one. */
  let text = raw;
  if (text.startsWith("[")) {
    const close = text.indexOf("]");
    if (close < 0) return null;
    text = text.slice(1, close);
  }
  return text.includes(":") ? parseV6(text) : parseV4(text);
}

function parseV4(text: string): Address | null {
  const parts = text.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return { bytes };
}

function parseV6(text: string): Address | null {
  /* A trailing dotted quad first — `::ffff:1.2.3.4` and the embedded forms
     both end that way. Rewritten into the two hex groups it stands for, so
     that everything below this line is plain hex. */
  let work = text;
  const lastColon = work.lastIndexOf(":");
  if (lastColon >= 0 && work.slice(lastColon + 1).includes(".")) {
    const quad = parseV4(work.slice(lastColon + 1));
    if (!quad) return null;
    const high = (quad.bytes[0] << 8) | quad.bytes[1];
    const low = (quad.bytes[2] << 8) | quad.bytes[3];
    work = `${work.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
  }

  const halves = work.split("::");
  if (halves.length > 2) return null;

  const groups = (segment: string): number[] | null => {
    if (segment === "") return [];
    const out: number[] = [];
    for (const part of segment.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      out.push(parseInt(part, 16));
    }
    return out;
  };

  const front = groups(halves[0]);
  const back = halves.length === 2 ? groups(halves[1]) : [];
  if (front === null || back === null) return null;

  let all: number[];
  if (halves.length === 1) {
    /* No `::`, so all eight have to be written out. */
    if (front.length !== 8) return null;
    all = front;
  } else {
    /* `::` stands for at least one group of zeros. */
    const written = front.length + back.length;
    if (written > 7) return null;
    const middle: number[] = [];
    for (let i = written; i < 8; i++) middle.push(0);
    all = [...front, ...middle, ...back];
  }

  const bytes: number[] = [];
  for (const group of all) bytes.push((group >> 8) & 0xff, group & 0xff);

  /* ::ffff:a.b.c.d — an IPv4 address wearing a v6 coat. Folded, because a
     vendor publishes `66.249.64.0/19` and a proxy may hand us the same
     address in the mapped form; compared as written, every hit behind such
     a proxy would read as a forgery. */
  const mapped =
    bytes.slice(0, 10).every((b) => b === 0) && bytes[10] === 0xff && bytes[11] === 0xff;
  return { bytes: mapped ? bytes.slice(12) : bytes };
}

/**
 * A `1.2.3.0/24`, a `2001:db8::/32`, or a bare address meaning "only this
 * one". Null on anything else, for the same reason as above.
 */
export function parsePrefix(input: string): { bytes: number[]; length: number } | null {
  const slash = input.indexOf("/");
  const address = parseAddress(slash === -1 ? input : input.slice(0, slash));
  if (!address) return null;
  const width = address.bytes.length * 8;
  if (slash === -1) return { bytes: address.bytes, length: width };
  const lengthText = input.slice(slash + 1);
  if (!/^\d{1,3}$/.test(lengthText)) return null;
  const length = Number(lengthText);
  if (length > width) return null;
  return { bytes: address.bytes, length };
}

/**
 * Is this address inside this prefix? False, never a throw, on junk.
 *
 * The length check is its own line and not something the byte loop takes
 * care of: a `/0` of either family would otherwise hold the whole of the
 * other, since there are no bits left to disagree about. See the two
 * assertions in check-crawler-verify.ts that exist only for this.
 */
export function prefixContains(prefix: string, ip: string): boolean {
  const net = parsePrefix(prefix);
  const address = parseAddress(ip);
  if (!net || !address) return false;
  if (net.bytes.length !== address.bytes.length) return false;

  const whole = net.length >> 3;
  for (let i = 0; i < whole; i++) if (net.bytes[i] !== address.bytes[i]) return false;
  const spare = net.length & 7;
  if (spare === 0) return true;
  /* The partial byte: compare only its leading `spare` bits. A vendor
     writing `66.249.65.162/27` still means the /27, so the host bits on
     both sides are masked away rather than trusted to be zero. */
  const mask = (0xff << (8 - spare)) & 0xff;
  return (net.bytes[whole] & mask) === (address.bytes[whole] & mask);
}

/** Is it in any of them? */
export function ipInAnyPrefix(prefixes: Iterable<string>, ip: string): boolean {
  for (const prefix of prefixes) if (prefixContains(prefix, ip)) return true;
  return false;
}

/**
 * The verdict for one row.
 *
 * `ranges` is vendor → prefixes, as `loadCrawlerRanges` builds it, and a
 * vendor missing from it is a vendor not asked this run. Both that and an
 * unknown crawler come back `null`, which is the whole point: the only way
 * to get `false` out of this function is for the vendor's own list to have
 * been read successfully and not to contain the address.
 */
export function classifyCrawlerIp(
  bot: string,
  ip: string | null | undefined,
  ranges: ReadonlyMap<string, readonly string[]>,
): boolean | null {
  const vendor = CRAWLER_VENDORS[bot];
  if (!vendor) return null;
  const prefixes = ranges.get(vendor);
  if (!prefixes || prefixes.length === 0) return null;
  if (!ip || !parseAddress(ip)) return null;
  return ipInAnyPrefix(prefixes, ip);
}
