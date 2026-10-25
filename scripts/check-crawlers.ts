// Which crawler is this, and does the yes/no agree with the name?
//
// The shop's biggest source of traffic is ChatGPT — 65 sessions a week
// against 7 from Google organic — and the crawler behind it is
// OAI-SearchBot. Telling it from GPTBot, which is the training crawler and
// sends nobody, is the whole reason this list exists; so is telling
// Googlebot from Googlebot-Image before planning a crawl budget around the
// number.
//
// Every user-agent below is a real published string, not an invention.
//
// Run: npx tsx scripts/check-crawlers.ts
import { matchCrawler, crawlerPathWorthLogging, CRAWLER_NAMES } from "../src/lib/pageview/crawlers";
import { isBotAgent } from "../src/lib/pageview/capture";

let failed = 0;
const fail = (message: string) => {
  console.log(`FAIL  ${message}`);
  failed++;
};

/* [agent, the name it must come back as]. The pairs that share a substring
   are the point: each one is a row the report would file under the wrong
   crawler if the list were sorted for tidiness. */
const AGENTS: [string, string][] = [
  ["Mozilla/5.0 (compatible; OAI-SearchBot/1.0; +https://openai.com/searchbot)", "OAI-SearchBot"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot", "ChatGPT-User"],
  ["Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.2; +https://openai.com/gptbot", "GPTBot"],
  ["Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)", "ClaudeBot"],
  ["Mozilla/5.0 (compatible; Claude-SearchBot/1.0; +Claude-SearchBot@anthropic.com)", "Claude-SearchBot"],
  ["Mozilla/5.0 (compatible; Claude-User/1.0; +Claude-User@anthropic.com)", "Claude-User"],
  ["Mozilla/5.0 (compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)", "PerplexityBot"],
  ["Mozilla/5.0 (compatible; Perplexity-User/1.0; +https://perplexity.ai/perplexity-user)", "Perplexity-User"],
  // The Google family, which is where the ordering earns its keep.
  ["Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Googlebot"],
  ["Googlebot-Image/1.0", "Googlebot-Image"],
  ["Mozilla/5.0 (compatible; Storebot-Google/1.0; +http://www.google.com/bot.html)", "Storebot-Google"],
  ["Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)", "Google-InspectionTool"],
  ["Mozilla/5.0 (compatible; Google-Extended/1.0)", "Google-Extended"],
  ["AdsBot-Google (+http://www.google.com/adsbot.html)", "AdsBot-Google"],
  ["Mediapartners-Google", "Mediapartners-Google"],
  // Apple, same trap.
  ["Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)", "Applebot"],
  ["Mozilla/5.0 (compatible; Applebot-Extended/0.1; +http://www.apple.com/go/applebot)", "Applebot-Extended"],
  // Microsoft
  ["Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)", "bingbot"],
  ["Mozilla/5.0 (compatible; BingPreview/1.0b; +http://www.bing.com/bingbot.htm)", "BingPreview"],
  // The rest
  ["Mozilla/5.0 (compatible; Amazonbot/0.1; +https://developer.amazon.com/support/amazonbot)", "Amazonbot"],
  ["meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)", "meta-externalagent"],
  ["Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)", "Bytespider"],
  ["CCBot/2.0 (https://commoncrawl.org/faq/)", "CCBot"],
  ["Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)", "YandexBot"],
  ["DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)", "DuckDuckBot"],
];

for (const [agent, want] of AGENTS) {
  const got = matchCrawler(agent);
  if (got !== want) fail(`${JSON.stringify(agent.slice(0, 54))} read as ${got}, wanted ${want}`);
}

/* A person is not a crawler. These are real browser strings and every one
   of them must come back null, or the human numbers lose rows to a report
   that was supposed to be about robots. */
const PEOPLE = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "",
];
for (const agent of PEOPLE) {
  const got = matchCrawler(agent);
  if (got !== null) fail(`a person's browser read as ${got}: ${JSON.stringify(agent.slice(0, 50))}`);
}
if (matchCrawler(null) !== null || matchCrawler(undefined) !== null) fail("a missing agent must be null");

/* THE TWO LISTS HAVE TO AGREE. isBotAgent decides whether a page view is
   counted as a person; matchCrawler decides what to call it. A crawler we
   can name that the other one calls human is the worse of the two failures,
   and it was real: Storebot-Google walks the whole purchase flow and
   creates Order rows, and no pattern in isBotAgent matched it, so every
   page it opened was in the human column. */
for (const [agent, name] of AGENTS) {
  if (!isBotAgent(agent)) fail(`${name} is named by matchCrawler but isBotAgent calls it a person`);
}

/* The paths. A table that logs every asset is a table nobody opens. */
const LOGGED = ["/", "/product/some-fridge", "/category/refrigeration", "/articles/how-to-choose", "/search"];
const SKIPPED = [
  "/_next/static/chunks/main.js",
  "/_next/image?url=%2Fa.png",
  "/api/price-compare",
  "/feeds/google-merchant.xml",
  "/img/thumb.webp",
  "/favicon.ico",
  "/robots.txt",
  "/sitemap.xml",
  "/anything.css",
  "/fonts/heebo.woff2",
];
for (const p of LOGGED) if (!crawlerPathWorthLogging(p)) fail(`${p} should be logged`);
for (const p of SKIPPED) if (crawlerPathWorthLogging(p)) fail(`${p} should not be logged`);

const total = AGENTS.length * 2 + PEOPLE.length + 1 + LOGGED.length + SKIPPED.length;
console.log(
  `${total - failed}/${total} passed  (${AGENTS.length} agents named and all flagged as bots, ` +
    `${PEOPLE.length} people and a missing agent left alone, ${LOGGED.length} paths kept, ` +
    `${SKIPPED.length} skipped, ${CRAWLER_NAMES.length} names in the list)`,
);
process.exit(failed === 0 ? 0 : 1);
