/**
 * Which requests are a page view, and what of them is kept.
 *
 * Written as a pure function over the request's shape so the proxy can call
 * it on the hot path and scripts/check-pageview.ts can call it on fixtures;
 * neither Next nor the database is imported here.
 *
 * WHAT IS KEPT, AND WHAT IS NOT. The log is a record of where a session
 * went, and nothing that says who it was:
 *
 *   kept:  the path; the marketing parameters, by allow-list; the referrer's
 *          host and path; the country Vercel derived; a coarse device class;
 *          whether the agent is a known crawler; whether the request was an
 *          in-app navigation.
 *   never: the IP, the raw user-agent, any other query parameter (an address
 *          can carry an email or a token, and "all of them except…" is how
 *          that gets stored), any cookie other than the visit id.
 *
 * Crawlers are KEPT and flagged, not dropped: Search Console says 1,278
 * pages are "crawled, not indexed" and nothing here could say whether
 * Googlebot ever arrived. This is that record.
 */

export type PageViewInput = {
  path: string;
  query: string | null;
  referrer: string | null;
  isBot: boolean;
  isRsc: boolean;
  country: string | null;
  device: "mobile" | "tablet" | "desktop" | null;
};

export type HeaderReader = { get(name: string): string | null };

/* Not pages. /admin is the staff's own screens; the rest are assets, data
   routes and feeds. Anything under these never reaches the proxy's matcher
   either, but the rule is stated here where it can be tested. */
const SKIP_PREFIXES = ["/_next/", "/api/", "/feeds/", "/img/", "/admin", "/favicon", "/.well-known/"];
const SKIP_EXTENSIONS =
  /\.(?:ico|png|jpe?g|gif|webp|avif|svg|css|js|mjs|map|txt|xml|json|webmanifest|woff2?|ttf|otf|mp4|webm|pdf)$/i;

/** Only these survive from the query string. */
const KEPT_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "srsltid", "gclid"];

const BOT_AGENTS =
  /googlebot|bingbot|applebot|gptbot|oai-searchbot|chatgpt-user|perplexitybot|claudebot|anthropic-ai|ahrefsbot|semrushbot|yandex|baiduspider|facebookexternalhit|bytespider|duckduckbot|petalbot|mj12bot|dotbot|slurp|google-inspectiontool|adsbot-google|mediapartners-google|headlesschrome|lighthouse|vercel-screenshot|uptimerobot|pingdom/i;

const MAX_PATH = 300;
const MAX_QUERY = 500;
const MAX_REFERRER = 200;

export function isSkippedPath(pathname: string): boolean {
  return SKIP_PREFIXES.some((p) => pathname.startsWith(p)) || SKIP_EXTENSIONS.test(pathname);
}

/** Next prefetches the page behind a link on hover and on viewport entry;
    logging those shows pages nobody opened. */
export function isPrefetch(headers: HeaderReader): boolean {
  if (headers.get("next-router-prefetch") === "1") return true;
  const purpose = (headers.get("purpose") ?? headers.get("sec-purpose") ?? "").toLowerCase();
  return purpose.includes("prefetch") || purpose.includes("prerender");
}

export function isBotAgent(userAgent: string | null): boolean {
  return !!userAgent && BOT_AGENTS.test(userAgent);
}

/** Coarse, and from the agent string only — the string itself is not kept. */
export function deviceClass(userAgent: string | null): PageViewInput["device"] {
  if (!userAgent) return null;
  if (/ipad|tablet|(android(?!.*mobile))/i.test(userAgent)) return "tablet";
  if (/mobi|iphone|ipod|android/i.test(userAgent)) return "mobile";
  return "desktop";
}

export function keptQuery(search: string): string | null {
  if (!search || search === "?") return null;
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of KEPT_PARAMS) {
    const value = params.get(key);
    if (value) kept.set(key, value.slice(0, 120));
  }
  const out = kept.toString();
  return out ? out.slice(0, MAX_QUERY) : null;
}

/** host + path, never the query — a referrer's query string is somebody
    else's URL and can carry anything. */
export function trimReferrer(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const url = new URL(referrer);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return `${url.host}${url.pathname}`.slice(0, MAX_REFERRER);
  } catch {
    return null;
  }
}

/**
 * The page view this request is, or null when it is not one: an asset, a
 * prefetch, a request that is not for a document at all.
 */
export function pageViewFromRequest(req: { pathname: string; search: string; headers: HeaderReader }): PageViewInput | null {
  const { pathname, search, headers } = req;
  if (isSkippedPath(pathname)) return null;
  if (isPrefetch(headers)) return null;

  const isRsc = headers.get("rsc") === "1";
  const accept = headers.get("accept") ?? "";
  if (!isRsc && !accept.includes("text/html")) return null;

  const ua = headers.get("user-agent");
  const country = (headers.get("x-vercel-ip-country") ?? "").toUpperCase().slice(0, 2) || null;

  return {
    path: pathname.slice(0, MAX_PATH),
    query: keptQuery(search),
    referrer: trimReferrer(headers.get("referer")),
    isBot: isBotAgent(ua),
    isRsc,
    country,
    device: deviceClass(ua),
  };
}
