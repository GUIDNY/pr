/**
 * Which crawler is this, by name.
 *
 * `isBotAgent` in capture.ts answers a yes/no question and is enough for
 * keeping bots out of the human numbers. It is not enough for the question
 * the shop actually has: **ChatGPT is the biggest source of traffic here**
 * — 65 sessions a week against 7 from Google organic — and the crawler that
 * feeds ChatGPT Search is OAI-SearchBot. Whether it ever arrives is not
 * answerable from a boolean.
 *
 * Nor is the other one: 1,147 pages sit in Search Console as "Discovered —
 * currently not indexed", and "Googlebot never came" and "Googlebot came
 * and declined" are different problems with different fixes. Only a name
 * against a path separates them.
 *
 * ORDER IS THE WHOLE IMPLEMENTATION. These are substring tests over one
 * string, and several of the names contain each other:
 *
 *   Googlebot-Image/1.0        contains Googlebot
 *   Applebot-Extended/1.0      contains Applebot
 *   Claude-SearchBot           would be lost to a bare Claude match
 *
 * So the specific ones come first and the first hit wins. A list sorted for
 * tidiness instead would quietly file every image crawl under Googlebot,
 * which is exactly the number somebody would then plan a crawl budget
 * around.
 *
 * Matched case-insensitively: the real strings are inconsistent about it
 * (`bingbot` lower, `Googlebot` capitalised) and a vendor changing the
 * case of their own agent should not silently empty a row of the report.
 */

/** [needle, the name stored] — most specific first. */
const CRAWLERS: readonly (readonly [string, string])[] = [
  // OpenAI. The first is the one this was built for.
  ["oai-searchbot", "OAI-SearchBot"],
  ["chatgpt-user", "ChatGPT-User"],
  ["gptbot", "GPTBot"],
  // Anthropic
  ["claude-searchbot", "Claude-SearchBot"],
  ["claude-user", "Claude-User"],
  ["claudebot", "ClaudeBot"],
  ["anthropic-ai", "anthropic-ai"],
  // Perplexity
  ["perplexity-user", "Perplexity-User"],
  ["perplexitybot", "PerplexityBot"],
  // Google — every one of these before the bare Googlebot.
  ["storebot-google", "Storebot-Google"],
  ["googlebot-image", "Googlebot-Image"],
  ["google-inspectiontool", "Google-InspectionTool"],
  ["google-extended", "Google-Extended"],
  ["adsbot-google", "AdsBot-Google"],
  ["mediapartners-google", "Mediapartners-Google"],
  ["googlebot", "Googlebot"],
  // Microsoft
  ["bingpreview", "BingPreview"],
  ["bingbot", "bingbot"],
  // Apple — Extended before the bare one.
  ["applebot-extended", "Applebot-Extended"],
  ["applebot", "Applebot"],
  // The rest, in no particular order because none contains another.
  ["amazonbot", "Amazonbot"],
  ["meta-externalagent", "meta-externalagent"],
  ["facebookexternalhit", "facebookexternalhit"],
  ["yandex", "YandexBot"],
  ["duckduckbot", "DuckDuckBot"],
  ["bytespider", "Bytespider"],
  ["ccbot", "CCBot"],
  ["petalbot", "PetalBot"],
  ["baiduspider", "Baiduspider"],
  ["ahrefsbot", "AhrefsBot"],
  ["semrushbot", "SemrushBot"],
  ["mj12bot", "MJ12bot"],
  ["dotbot", "DotBot"],
  ["slurp", "Slurp"],
  ["uptimerobot", "UptimeRobot"],
  ["pingdom", "Pingdom"],
  ["lighthouse", "Lighthouse"],
  ["vercel-screenshot", "Vercel-Screenshot"],
  ["headlesschrome", "HeadlessChrome"],
];

/** The crawler's name, or null when the agent is nobody we know. */
export function matchCrawler(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  for (const [needle, name] of CRAWLERS) if (ua.includes(needle)) return name;
  return null;
}

/** Every name this can return, for the guard and for the back office. */
export const CRAWLER_NAMES: readonly string[] = [...new Set(CRAWLERS.map(([, name]) => name))];

/**
 * Is this a path worth a row?
 *
 * Not the assets. The proxy's own matcher already keeps `_next`, `api`,
 * `feeds`, `img` and the file extensions out, so this is the second fence
 * rather than the first — and it is written out anyway because the question
 * it answers ("will this table still be readable in a quarter") has a
 * different answer from the proxy's ("is this a page"), and because a path
 * with no extension under a new prefix slips past a matcher.
 */
const SKIP = /^\/(?:_next|api|feeds|img|favicon|robots\.txt|sitemap|.*\.(?:png|jpe?g|webp|svg|gif|ico|css|js|mjs|woff2?|ttf|xml|txt|map))/i;

export function crawlerPathWorthLogging(pathname: string): boolean {
  return !SKIP.test(pathname);
}
