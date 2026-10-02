import { getSession } from "@/lib/auth";
import { COUPON_DAYS, REWARDS, WHEEL_COINS, checkIn, checkinStatus } from "@/lib/game-wheel";
import { gameJson as json, gameOriginAllowed, gamePreflight } from "@/lib/game-api";

// The 3D mall's daily check-in for a signed-in customer: the coins wheel, and
// the loyalty coupons it earns. Rules and reasons in lib/game-wheel.ts; the
// game only draws the answer. A guest's wheel stays in the game.
//
//   GET  → the wheel's coin odds, the reward rules, and the account's status
//   POST → today's check-in (a second POST the same day changes nothing)
export const dynamic = "force-dynamic";

const rules = {
  wheel: WHEEL_COINS.map((c) => ({ id: c.id, coins: c.coins, chance: c.w })),
  rewards: Object.values(REWARDS).map((r) => ({ id: r.id, label: r.label, rule: r.rule, min: r.min })),
  couponDays: COUPON_DAYS,
};

export async function OPTIONS() {
  return gamePreflight("GET, POST, OPTIONS");
}

export async function GET() {
  const session = await getSession();
  return json({ signedIn: !!session, rules, status: session ? await checkinStatus(session.sub) : null });
}

export async function POST(request: Request) {
  if (!gameOriginAllowed(request)) return json({ error: "forbidden" }, 403);
  const session = await getSession();
  if (!session) return json({ signedIn: false }, 401);
  const r = await checkIn(session.sub);
  return json({ signedIn: true, ...r });
}
