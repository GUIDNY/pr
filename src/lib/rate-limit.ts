import "server-only";

/**
 * A sliding-window counter, in memory.
 *
 * It exists for one endpoint: the Alfred chat. That route is public, takes
 * no authentication, and every call spends real money at Google. One `for`
 * loop pointed at it is a few hundred dollars a day, or — on a free tier —
 * Google throttling the shop's chat off for actual customers. Neither shows
 * up anywhere until somebody notices the chat has been silent for a week.
 *
 * WHAT THIS IS NOT. The counter lives in the process, so it is per instance:
 * Vercel may run several, and each keeps its own tally. Somebody determined
 * enough to spread requests across instances gets a multiple of the limit.
 * That is a real hole and it is accepted on purpose — the alternative is a
 * database write on every chat message, on the hot path of the one feature
 * whose whole appeal is that it answers quickly, to defend against an
 * attacker who has not turned up yet.
 *
 * What it does stop is the case that actually happens: a script, a stuck
 * retry loop, a scraper, somebody holding down a key. For that a
 * single-process counter is enough, because those all come from one place
 * and hit whichever instance is warm.
 *
 * If chat abuse ever becomes real rather than theoretical, this is the file
 * to swap for something shared — the callers do not change.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/* Nothing here is ever deleted otherwise, and a Map that only grows is a
   memory leak with a slow fuse — one entry per IP that ever visited. Expired
   windows are swept whenever the map gets big rather than on a timer, so an
   idle instance does no work at all. */
const SWEEP_THRESHOLD = 5_000;

function sweep(now: number) {
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key);
  }
}

export type RateLimitResult = {
  ok: boolean;
  /** Seconds until the window resets. For the Retry-After header. */
  retryAfter: number;
};

/**
 * Count one hit against `key` and say whether it is allowed.
 *
 * The window is fixed rather than rolling: it starts on the first request
 * and everything inside it shares one counter. Cruder than a rolling window
 * and perfectly adequate here — the difference only shows at the boundary,
 * and the boundary is not where abuse lives.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();

  if (windows.size > SWEEP_THRESHOLD) sweep(now);

  const existing = windows.get(key);
  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }

  existing.count += 1;
  if (existing.count > limit) {
    return { ok: false, retryAfter: Math.ceil((existing.resetAt - now) / 1000) };
  }
  return { ok: true, retryAfter: 0 };
}

/**
 * Who is asking, as well as this can be known behind a proxy.
 *
 * Vercel sets x-forwarded-for and the leftmost entry is the client. The
 * header is forgeable in general — anybody can send whatever they like — but
 * not here: Vercel's edge rewrites it, so what reaches the function is the
 * connecting address rather than the caller's claim.
 *
 * When there is no address at all, everything shares the bucket "unknown".
 * That is deliberate: an unidentifiable caller should be limited together
 * with every other unidentifiable caller, not waved through.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}
