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
 *          And, since 25 October, the crawler's NAME when the agent is one we
 *          recognise — "Googlebot", not the agent string. A name is what
 *          separates "Googlebot never came" from "Googlebot came and
 *          declined", which is the question 1,147 pages in Search Console
 *          turn on, and it says nothing about a person because there is no
 *          person. The raw agent of a crawler is kept in CrawlerHit, which
 *          holds crawlers and nothing else.
 *   never: the IP, the raw user-agent of a visitor, any other query
 *          parameter (an address can carry an email or a token, and "all of
 *          them except…" is how that gets stored), any cookie other than
 *          the visit id. The privacy page promises exactly this — "הרישום
 *          אינו כולל כתובת IP, מחרוזת דפדפן" — so a human's agent string
 *          must not start being stored here, whatever a spec asks for.
 *
 * Crawlers are KEPT and flagged, not dropped: Search Console says 1,278
 * pages are "crawled, not indexed" and nothing here could say whether
 * Googlebot ever arrived. This is that record.
 */

import { matchCrawler } from "./crawlers";

export type PageViewInput = {
  path: string;
  query: string | null;
  referrer: string | null;
  isBot: boolean;
  /** The crawler's name when we know it; null for a person. */
  bot: string | null;
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

/* And these two, from a closed list only: which order shoppers pick on a
   category page and how deep they page, which nothing else records (16
   November). The sort values are ListingSort in queries/listing-order.ts,
   repeated here so the proxy does not import the query layer;
   check:pageview fails if the two drift. */
export const KEPT_SORTS = ["relevance", "price-asc", "price-desc", "newest", "rating"] as const;
const MAX_KEPT_PAGE = 50;

/* Kept in step with lib/pageview/crawlers.ts, and check:crawlers fails if a
   crawler it can name is not also flagged here. Six were missing and the
   worst of them was Storebot-Google: Google's shopping crawler walks the
   whole purchase flow and creates real Order rows — check-payment-alert
   lists five of them — and because no pattern here matched it, every page
   it opened was counted as a person. */
const BOT_AGENTS =
  /googlebot|storebot-google|bingbot|bingpreview|applebot|gptbot|oai-searchbot|chatgpt-user|perplexitybot|perplexity-user|claudebot|claude-searchbot|claude-user|anthropic-ai|amazonbot|meta-externalagent|ccbot|ahrefsbot|semrushbot|yandex|baiduspider|facebookexternalhit|bytespider|duckduckbot|petalbot|mj12bot|dotbot|slurp|google-inspectiontool|google-extended|adsbot-google|mediapartners-google|headlesschrome|lighthouse|vercel-screenshot|uptimerobot|pingdom/i;

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

/**
 * A document the browser is fetching ahead of a click — Chrome's prefetch
 * or prerender of a Google result (`Sec-Purpose: prefetch;prerender`) — as
 * opposed to the App Router's own RSC prefetch. Not a page view (nobody has
 * opened it yet), but if it becomes one, the proxy will never see the
 * request, so this is the proxy's only chance to issue the visit cookie.
 * Measured on the live site, 16 November: none of the three prefetch
 * headers got a cookie back.
 */
export function isDocumentPrefetch(req: { pathname: string; headers: HeaderReader }): boolean {
  const { pathname, headers } = req;
  if (isSkippedPath(pathname)) return false;
  if (headers.get("next-router-prefetch") === "1" || headers.get("rsc") === "1") return false;
  if (!(headers.get("accept") ?? "").includes("text/html")) return false;
  return isPrefetch(headers);
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
  /* The listing's own controls, kept only when the value is one the shop
     itself offers — so a hand-edited address cannot smuggle anything into
     the log under these names. Never the search box's `q`: that is free
     text a person typed. */
  const sort = params.get("sort");
  if (sort && (KEPT_SORTS as readonly string[]).includes(sort)) kept.set("sort", sort);
  const page = params.get("page");
  if (page && /^[1-9]\d?$/.test(page) && Number(page) <= MAX_KEPT_PAGE) kept.set("page", page);
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
 * prefetch, an RSC fetch, a request that is not for a document at all.
 *
 * DOCUMENTS ONLY, by design. The first version also logged RSC fetches
 * (in-app navigations) here, and the browser probe showed why that is not
 * enough: the App Router prefetches a link's page on hover or on scroll,
 * and a click then renders from that cache without asking the server at
 * all. The prefetch is refused (nobody opened it), the click never arrives,
 * and the navigation is invisible. So in-app navigations are reported by
 * the page itself — components/analytics/path-log.tsx, through
 * pageViewFromNavigation below — and this function keeps to full loads,
 * which is also what every crawler sends.
 */
export function pageViewFromRequest(req: { pathname: string; search: string; headers: HeaderReader }): PageViewInput | null {
  const { pathname, search, headers } = req;
  if (isSkippedPath(pathname)) return null;
  if (isPrefetch(headers)) return null;
  if (headers.get("rsc") === "1") return null;
  if (!(headers.get("accept") ?? "").includes("text/html")) return null;

  const ua = headers.get("user-agent");
  return {
    path: pathname.slice(0, MAX_PATH),
    query: keptQuery(search),
    referrer: trimReferrer(headers.get("referer")),
    isBot: isBotAgent(ua),
    bot: matchCrawler(ua),
    isRsc: false,
    country: countryFrom(headers),
    device: deviceClass(ua),
  };
}

function countryFrom(headers: HeaderReader): string | null {
  return (headers.get("x-vercel-ip-country") ?? "").toUpperCase().slice(0, 2) || null;
}

/** A page path as the browser reports it, and nothing else: absolute,
    single-slash, no scheme, no host, no query (that is sent apart). */
const NAV_PATH = /^\/(?!\/)[^\s?#]*$/;

/**
 * An in-app navigation, as the page reported it after the App Router moved
 * to a new path. `from` is the path it left, which stands in for the
 * referrer: an in-app move has no Referer of its own. The agent and country
 * still come from the request the beacon travelled on; the body is trusted
 * for nothing but the two paths and the query, each checked.
 */
export function pageViewFromNavigation(
  body: { path?: unknown; search?: unknown; from?: unknown },
  headers: HeaderReader,
  host: string,
): PageViewInput | null {
  const path = typeof body.path === "string" ? body.path : "";
  if (!NAV_PATH.test(path) || path.length > MAX_PATH || isSkippedPath(path)) return null;
  const search = typeof body.search === "string" && body.search.length <= 2000 ? body.search : "";
  const from = typeof body.from === "string" && NAV_PATH.test(body.from) ? body.from : null;
  const ua = headers.get("user-agent");
  return {
    path,
    query: keptQuery(search),
    referrer: from ? `${host}${from}`.slice(0, MAX_REFERRER) : null,
    isBot: isBotAgent(ua),
    bot: matchCrawler(ua),
    isRsc: true,
    country: countryFrom(headers),
    device: deviceClass(ua),
  };
}

/**
 * A full load the proxy never saw, as the page reported it on its first
 * render (components/analytics/path-log.tsx, through api/internal/pv/nav with
 * `landing: true`).
 *
 * WHY THIS EXISTS, measured on 16 November: a buyer browsed, added to the
 * cart and opened a payment form for fourteen minutes and none of it was
 * logged, because the browser never held a visit cookie. The proxy issues
 * the cookie only on a full document load that is not a prefetch, and a
 * page the browser had already prefetched or prerendered (Chrome does this
 * from a Google results page, and the in-app browsers of social apps do it
 * on their own) reaches the screen without that request ever being made.
 * Every beacon after that carried no cookie and was dropped. The server
 * answers the landing beacon by writing nothing when the cookie is already
 * there — the proxy logged that load — and by issuing one and logging the
 * page when it is not.
 *
 * Same rules as a navigation, with the document's referrer standing in for
 * `from`, trimmed exactly as the proxy trims the Referer header.
 */
export function pageViewFromLanding(
  body: { path?: unknown; search?: unknown; referrer?: unknown },
  headers: HeaderReader,
  host: string,
): PageViewInput | null {
  const view = pageViewFromNavigation({ path: body.path, search: body.search }, headers, host);
  if (!view) return null;
  const referrer = typeof body.referrer === "string" && body.referrer.length <= 2000 ? trimReferrer(body.referrer) : null;
  return { ...view, referrer };
}
