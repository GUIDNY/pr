/**
 * The first-party page-view log: what is logged, what is kept, and how long
 * a visit id lives. No database — the rules are pure functions over a
 * request's shape (lib/pageview), so every case here is a fixture.
 *
 *   npm run check:pageview
 */
import {
  pageViewFromRequest,
  pageViewFromNavigation,
  keptQuery,
  trimReferrer,
  deviceClass,
  isSkippedPath,
} from "../src/lib/pageview/capture";
import { parseSid, resolveSid, serializeSid, SID_IDLE_SECONDS, SID_MAX_SECONDS } from "../src/lib/pageview/sid";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}
const headers = (h: Record<string, string>) => ({ get: (k: string) => h[k.toLowerCase()] ?? null });
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const IPAD = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const GOOGLEBOT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";
const html = { accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" };

console.log("\nwhat is a page view");
is("a full page load is logged", !!pageViewFromRequest({ pathname: "/product/x", search: "", headers: headers({ ...html, "user-agent": CHROME }) }), true);
is("an RSC fetch is not logged at the proxy (the page reports navigations)", pageViewFromRequest({ pathname: "/category/tvs", search: "", headers: headers({ rsc: "1", accept: "*/*", "user-agent": CHROME }) }), null);
is("a hover prefetch is not", pageViewFromRequest({ pathname: "/product/x", search: "", headers: headers({ rsc: "1", "next-router-prefetch": "1", "user-agent": CHROME }) }), null);
is("a purpose: prefetch is not", pageViewFromRequest({ pathname: "/product/x", search: "", headers: headers({ ...html, purpose: "prefetch", "user-agent": CHROME }) }), null);
is("a non-document request is not", pageViewFromRequest({ pathname: "/product/x", search: "", headers: headers({ accept: "*/*", "user-agent": CHROME }) }), null);
is("assets are not", isSkippedPath("/opengraph-image.png"), true);
is("the data routes are not", isSkippedPath("/api/alfred-chat"), true);
is("the back office is not", isSkippedPath("/admin/orders/PR-1"), true);
is("the feed is not", isSkippedPath("/feeds/google-merchant.xml"), true);
is("the home page is", isSkippedPath("/"), false);

console.log("\nwhat is kept");
const view = pageViewFromRequest({
  pathname: "/product/sony-tvs-50s25pb",
  search: "?utm_source=google&utm_medium=cpc&gclid=abc&email=someone%40example.com&token=secret&fbclid=zzz",
  headers: headers({ ...html, "user-agent": IPHONE, referer: "https://www.google.com/search?q=sony+50&sxsrf=private", "x-vercel-ip-country": "il" }),
})!;
is("marketing parameters, by allow-list", view.query, "utm_source=google&utm_medium=cpc&gclid=abc");
is("an email or a token in the address is dropped", view.query?.includes("example.com") || view.query?.includes("secret"), false);
is("the referrer keeps host and path, never its query", view.referrer, "www.google.com/search");
is("country from Vercel's header, upper-cased", view.country, "IL");
is("device is a class, not the agent string", view.device, "mobile");
is("a phone is mobile", deviceClass(IPHONE), "mobile");
is("a tablet is tablet", deviceClass(IPAD), "tablet");
is("a desktop is desktop", deviceClass(CHROME), "desktop");
is("no query means null", keptQuery(""), null);
is("a junk referrer is null", trimReferrer("javascript:void(0)"), null);
is("nothing in the record names the person", Object.keys(view).sort(), ["country", "device", "isBot", "isRsc", "path", "query", "referrer"]);

console.log("\nin-app navigations, as the page reports them");
const nav = pageViewFromNavigation(
  { path: "/product/x", search: "?utm_source=a&email=b", from: "/category/tvs" },
  headers({ "user-agent": IPHONE, "x-vercel-ip-country": "il" }),
  "buytoday.co.il",
)!;
is("logged and flagged as a navigation", nav.isRsc, true);
is("the path it left stands in for the referrer", nav.referrer, "buytoday.co.il/category/tvs");
is("query is still allow-listed", nav.query, "utm_source=a");
is("device and country still come from the request", [nav.device, nav.country], ["mobile", "IL"]);
is("a path with a host in it is refused", pageViewFromNavigation({ path: "//evil.com/x" }, headers({}), "h"), null);
is("a path that is not a path is refused", pageViewFromNavigation({ path: "javascript:alert(1)" }, headers({}), "h"), null);
is("the back office is refused here too", pageViewFromNavigation({ path: "/admin/orders" }, headers({}), "h"), null);
is("a junk 'from' is dropped, not stored", pageViewFromNavigation({ path: "/x", from: "https://x.y/z" }, headers({}), "h")?.referrer, null);

console.log("\ncrawlers are kept and flagged");
const bot = pageViewFromRequest({ pathname: "/product/x", search: "", headers: headers({ ...html, "user-agent": GOOGLEBOT }) });
is("Googlebot is logged", bot !== null, true);
is("…and flagged", bot?.isBot, true);
is("a person is not flagged", view.isBot, false);

console.log("\nthe visit id");
const now = Date.UTC(2026, 9, 18, 12, 0, 0);
const fresh = resolveSid(undefined, now);
is("missing cookie → new id", fresh.isNew, true);
const raw = serializeSid(fresh);
is("round-trips through the cookie", parseSid(raw)?.id, fresh.id);
is("a live cookie keeps its id", resolveSid(raw, now + 10 * 60_000).id, fresh.id);
is("…and is not new", resolveSid(raw, now + 10 * 60_000).isNew, false);
is("24 hours after it was issued it is replaced, mid-browse or not", resolveSid(raw, now + SID_MAX_SECONDS * 1000 + 1000).isNew, true);
is("a cookie from the future is not trusted", resolveSid(serializeSid({ id: fresh.id, startedAt: Math.floor(now / 1000) + 3600 }), now).isNew, true);
is("garbage is a new id, not a crash", resolveSid("not-a-cookie", now).isNew, true);
is("the idle window is 30 minutes", SID_IDLE_SECONDS, 1800);
is("the hard cap is 24 hours", SID_MAX_SECONDS, 86400);

console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
process.exit(failures === 0 ? 0 : 1);
