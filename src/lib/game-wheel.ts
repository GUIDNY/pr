import "server-only";
import { randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";

/**
 * The 3D mall's daily check-in: a wheel that pays game coins, and discounts
 * that are EARNED, never won.
 *
 * WHY THE DISCOUNTS ARE NOT ON THE WHEEL. Under the Penal Law (§224) a
 * "lottery" is any arrangement where money, money's worth or a benefit is won
 * more by chance than by skill, and running one is an offence. The Ministry
 * of Finance's general permit for promotional lotteries (1.1.2010) allows
 * them only as a campaign with an appointed supervisor (a lawyer or an
 * accountant), rules published in advance, a report afterwards, and at most
 * two campaigns a year with 120 days between them. A wheel that hands out
 * shekel discounts by chance every day is a standing lottery and fits none
 * of that. So:
 *
 *   - The wheel pays only game coins, which buy clothes for a figure in a
 *     game and nothing else. No shekel value, no conversion, ever — if that
 *     changes, the wheel stops being a free game and becomes a lottery.
 *   - Real discounts are rewards for coming back, fixed in advance and
 *     certain: a welcome coupon on the first check-in, one for every 7 days
 *     in a row, one for 30 check-in days in all. Nothing about them depends
 *     on chance, so they are not a lottery; they are a loyalty benefit.
 *
 * A check-in is the day's spin, one a day per account (GameSpin's unique
 * key), counted here on the server, which is the only place a benefit worth
 * money may be decided. Every coupon is a personal, single-use code
 * (GAME-XXXXXX), valid COUPON_DAYS, retired by retireGameCoupon when the
 * order that used it is final.
 */

export const WHEEL_COINS = [
  { id: "c5", coins: 5, w: 0.25 },
  { id: "c10", coins: 10, w: 0.3 },
  { id: "c15", coins: 15, w: 0.18 },
  { id: "c20", coins: 20, w: 0.13 },
  { id: "c30", coins: 30, w: 0.08 },
  { id: "c50", coins: 50, w: 0.04 },
  { id: "c100", coins: 100, w: 0.02 },
] as const;

export type Reward = { id: "welcome" | "streak7" | "days30"; type: "FIXED" | "PERCENTAGE"; value: number; min: number; max?: number; label: string; rule: string };

export const REWARDS: Record<Reward["id"], Reward> = {
  welcome: { id: "welcome", type: "PERCENTAGE", value: 5, min: 0, max: 100, label: "5% הנחה", rule: "מתנת הצטרפות, בכניסה הראשונה" },
  streak7: { id: "streak7", type: "FIXED", value: 20, min: 150, label: "₪20 הנחה", rule: "על כל 7 ימים ברצף" },
  days30: { id: "days30", type: "FIXED", value: 50, min: 300, label: "₪50 הנחה", rule: "על 30 ימי כניסה" },
};

export const COUPON_DAYS = 7;

/** The customer's calendar day, in Israel, whatever the server's clock zone. */
export function israelDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
const prevDay = (day: string) => {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function rollCoins() {
  const total = WHEEL_COINS.reduce((s, p) => s + p.w, 0);
  let r = (randomInt(0, 1_000_000) / 1_000_000) * total;
  for (const p of WHEEL_COINS) {
    r -= p.w;
    if (r < 0) return p;
  }
  return WHEEL_COINS[0];
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  return "GAME-" + Array.from(randomBytes(6), (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export type IssuedCoupon = { code: string; label: string; rule: string; min: number; endsAt: string };

async function issue(reward: Reward): Promise<IssuedCoupon> {
  let code = newCode();
  for (let i = 0; i < 5 && (await db.promotion.findUnique({ where: { code } })); i++) code = newCode();
  const endsAt = new Date(Date.now() + COUPON_DAYS * 86_400_000);
  await db.promotion.create({
    data: {
      name: `קניון · ${reward.label} · ${reward.rule}`,
      code,
      type: reward.type,
      value: reward.value,
      scope: "CART",
      minCartAmount: reward.min || null,
      maxDiscount: reward.max ?? null,
      startsAt: new Date(),
      endsAt,
      isActive: true,
    },
  });
  return { code, label: reward.label, rule: reward.rule, min: reward.min, endsAt: endsAt.toISOString() };
}

/** Where an account stands: today's check-in, the streak, the days, and the coupons still usable. */
export async function checkinStatus(userId: string) {
  const rows = await db.gameSpin.findMany({ where: { userId }, orderBy: { day: "desc" }, select: { day: true, prize: true, code: true } });
  const today = israelDay();
  const days = new Set(rows.map((r) => r.day));
  let streak = 0;
  for (let d = days.has(today) ? today : prevDay(today); days.has(d); d = prevDay(d)) streak++;
  const codes = rows.map((r) => r.code).filter((c): c is string => !!c);
  const promos = codes.length
    ? await db.promotion.findMany({ where: { code: { in: codes }, isActive: true, endsAt: { gt: new Date() } }, select: { code: true, name: true, minCartAmount: true, endsAt: true, type: true, value: true } })
    : [];
  const todayRow = rows.find((r) => r.day === today) ?? null;
  return {
    checkedInToday: !!todayRow,
    todayCoins: todayRow ? WHEEL_COINS.find((c) => c.id === todayRow.prize.split("+")[0])?.coins ?? 0 : 0,
    streak,
    totalDays: days.size,
    welcomeGiven: rows.some((r) => r.prize.includes("+welcome")),
    coupons: promos.map((p) => ({
      code: p.code!,
      label: p.type === "PERCENTAGE" ? `${p.value}% הנחה` : `₪${p.value} הנחה`,
      min: p.minCartAmount ?? 0,
      endsAt: p.endsAt!.toISOString(),
    })),
  };
}

/**
 * Today's check-in: coins from the wheel, and whatever loyalty reward the
 * day completes. A second call the same day returns the same answer and
 * issues nothing (the unique key on GameSpin).
 */
export async function checkIn(userId: string) {
  const day = israelDay();
  const coins = rollCoins();
  try {
    await db.gameSpin.create({ data: { userId, day, prize: coins.id } });
  } catch {
    return { fresh: false, coins: 0, rewards: [] as IssuedCoupon[], status: await checkinStatus(userId) };
  }

  const status = await checkinStatus(userId);
  const due: Reward[] = [];
  if (!status.welcomeGiven) due.push(REWARDS.welcome);
  if (status.streak > 0 && status.streak % 7 === 0) due.push(REWARDS.streak7);
  if (status.totalDays === 30) due.push(REWARDS.days30);

  const rewards: IssuedCoupon[] = [];
  for (const r of due) rewards.push(await issue(r));
  if (rewards.length) {
    await db.gameSpin.update({
      where: { userId_day: { userId, day } },
      data: { prize: [coins.id, ...due.map((r) => r.id)].join("+"), code: rewards[0].code },
    });
    // a second coupon on the same day (rare: welcome and a milestone together) is still findable by its Promotion
  }
  return { fresh: true, coins: coins.coins, rewards, status: await checkinStatus(userId) };
}

/** A mall coupon is good for one paid order; after it, it is switched off. */
export async function retireGameCoupon(code: string | null | undefined): Promise<void> {
  if (!code || !code.startsWith("GAME-")) return;
  await db.promotion.updateMany({ where: { code }, data: { isActive: false } }).catch(() => {});
}
