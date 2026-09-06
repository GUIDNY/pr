import "server-only";
import { SITE_URL } from "@/lib/site-url";

// Telling Bing a page changed, the moment it changes, instead of waiting for
// it to come back and look.
//
// This matters here beyond Bing's own traffic: ChatGPT and Copilot answer
// from Bing's index, so how quickly a price or a stock change lands there is
// how quickly an answer engine stops quoting a stale one.
//
// The key is public by design — it is served at /<key>.txt so that Bing can
// prove the submitter controls the domain — so it lives in the repo next to
// the file rather than in a secret store. scripts/check-indexnow.ts is what
// keeps the two from drifting apart; a mismatch is a 403 on every submission
// and nothing else says so.
export const INDEXNOW_KEY = "782a49230f4c49acb05e1a1ebd61b48b";

const ENDPOINT = "https://api.indexnow.org/IndexNow";
// IndexNow's own cap for a single request.
const MAX_URLS = 10_000;

/**
 * Announce that these paths changed. Never throws, never blocks anything.
 *
 * Batched by the caller on purpose: one submission carrying every product a
 * sync touched, not one per product and certainly not one per field. A sync
 * moves a few hundred rows, and a few hundred requests to a service that
 * accepts 10,000 URLs in one is how a submitter gets rate-limited off it.
 *
 * Production only. A preview deployment reporting real URLs would be asking
 * Bing to re-crawl the shop on the strength of a branch nobody has merged.
 */
export async function submitUrls(paths: string[]): Promise<{ submitted: number; ok: boolean }> {
  if (process.env.VERCEL_ENV !== "production") return { submitted: 0, ok: true };
  if (process.env.INDEXNOW_DISABLED === "1") return { submitted: 0, ok: true };

  const host = new URL(SITE_URL).host;
  const urls = [...new Set(paths)]
    .map((p) => (p.startsWith("http") ? p : `${SITE_URL}${p.startsWith("/") ? p : `/${p}`}`))
    .filter((u) => u.startsWith(SITE_URL))
    .slice(0, MAX_URLS);
  if (urls.length === 0) return { submitted: 0, ok: true };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        host,
        key: INDEXNOW_KEY,
        keyLocation: `${SITE_URL}/${INDEXNOW_KEY}.txt`,
        urlList: urls,
      }),
    });
    // 200 and 202 both mean accepted. Anything else is worth knowing about but
    // is never worth failing a sync or an admin save over: the page is already
    // correct, and the next change will submit it again.
    if (!response.ok) {
      console.warn(`[indexnow] ${response.status} ${response.statusText} for ${urls.length} urls`);
      return { submitted: urls.length, ok: false };
    }
    return { submitted: urls.length, ok: true };
  } catch (error) {
    console.warn("[indexnow] submission failed", error);
    return { submitted: urls.length, ok: false };
  }
}

/** Convenience for the common case: some products changed. */
export function productPaths(slugs: string[]): string[] {
  return slugs.map((slug) => `/product/${slug}`);
}
