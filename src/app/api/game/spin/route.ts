import { getSession } from "@/lib/auth";
import { COUPON_DAYS, DAILY_COUPON_CAP, WHEEL_PRIZES, spinWheel, todaysSpin } from "@/lib/game-wheel";
import { gameJson as json, gameOriginAllowed, gamePreflight } from "@/lib/game-api";

// The 3D mall's daily wheel for a signed-in customer. The roll, the one-a-day
// rule and the coupon are all decided in lib/game-wheel.ts; the game only
// draws the answer. A guest's wheel stays in the game and pays coins only.
//
//   GET  → the odds, and today's result if the account has already spun
//   POST → spin (a second POST the same day returns the same result)
export const dynamic = "force-dynamic";

const odds = WHEEL_PRIZES.map((p) => ({ id: p.id, chance: p.w }));

export async function OPTIONS() {
  return gamePreflight("GET, POST, OPTIONS");
}

export async function GET() {
  const session = await getSession();
  const today = session ? await todaysSpin(session.sub) : null;
  return json({ signedIn: !!session, odds, couponDays: COUPON_DAYS, dailyCap: DAILY_COUPON_CAP, today });
}

export async function POST(request: Request) {
  if (!gameOriginAllowed(request)) return json({ error: "forbidden" }, 403);
  const session = await getSession();
  if (!session) return json({ signedIn: false }, 401);
  const { result, fresh } = await spinWheel(session.sub);
  return json({ signedIn: true, fresh, result });
}
