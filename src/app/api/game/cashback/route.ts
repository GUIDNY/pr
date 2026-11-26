import { getSession } from "@/lib/auth";
import { purchaseLevel } from "@/lib/game-levels";
import { cashbackSummary } from "@/lib/cashback-v2";
import { cashbackV2Enabled, mallCashbackView } from "@/lib/cashback-v2-rules";
import { gameCorsHeaders, gameJson as json, gamePreflight } from "@/lib/game-api";
import { rateLimit } from "@/lib/rate-limit";

// The 3D mall's read-only view of a member's cashback (v2): what is usable,
// what is still pending, their level and its rate, and how far the balance is
// from the next coupon. Amounts are whole agorot.
//
// Read only: there is no POST, and nothing in the request is read except the
// session cookie — no id, no query, no body — so the only account this can
// ever describe is the one that is signed in. Same cookie-and-CORS contract
// as /api/game/profile (see the long note there): the game's origin is the
// only one named, and nothing is cached.
//
//   signed out            → { signedIn: false }
//   CASHBACK_V2_ENABLED off → { signedIn: true, enabled: false }, and the v2
//                             tables are not touched (they may not exist yet)
//   on                    → { signedIn: true, enabled: true, balance, pending,
//                             pendingGifts, level, percent, minCredit,
//                             toNextCredit, releaseDays }
//
// The mall does not call this yet; it is here for when it does.
export const dynamic = "force-dynamic";

/** Per account. The game needs this once when the panel opens; a loop that
    asks more than this often is a bug or a script, and each answer costs
    three queries on a database with a small connection budget. */
const PER_MINUTE = 30;

export async function OPTIONS() {
  return gamePreflight("GET, OPTIONS");
}

export async function GET() {
  const session = await getSession();
  if (!session) return json({ signedIn: false });
  if (!cashbackV2Enabled()) return json({ signedIn: true, enabled: false });

  const limit = rateLimit(`mall-cashback:${session.sub}`, PER_MINUTE, 60_000);
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: "rate_limited" }), {
      status: 429,
      headers: { ...gameCorsHeaders(), "Content-Type": "application/json", "Retry-After": String(limit.retryAfter) },
    });
  }

  try {
    const [lv, summary] = await Promise.all([purchaseLevel(session.sub), cashbackSummary(session.sub)]);
    return json({ signedIn: true, enabled: true, ...mallCashbackView(summary, lv.level, lv.cashback) });
  } catch (error) {
    console.error("[cashback] mall view failed", error);
    return json({ signedIn: true, enabled: true, error: "unavailable" }, 503);
  }
}
