import "server-only";
import { randomBytes, randomInt } from "crypto";
import { db } from "@/lib/db";

/**
 * The 3D mall's daily wheel, rolled here and nowhere else.
 *
 * Most of it pays game coins, which are cosmetic. A few thin gold slices pay a
 * real discount, and anything worth money has to be decided by the server:
 * the game runs on the customer's phone, and a prize the phone decides is a
 * prize anybody can award themselves. So a signed-in customer's spin is a
 * request to this module, once a day per account (GameSpin's unique key), and
 * the game only animates the answer.
 *
 * The odds are written once, here, and the game shows them next to the wheel
 * in plain numbers. The slices are drawn narrow for the rare prizes, but
 * their size is only a picture; these weights are the chance.
 *
 * A coupon prize is a personal, single-use code (GAME-XXXXXX): a Promotion of
 * its own, valid for COUPON_DAYS, retired by retireGameCoupon the moment an
 * order that used it is paid. And there is a ceiling on the whole day
 * (DAILY_COUPON_CAP): once that many coupons have gone out, the rest of the
 * day's spins land on coins, whatever the roll.
 */

export type WheelPrize =
  | { id: string; kind: "coins"; coins: number; w: number }
  | { id: string; kind: "coupon"; type: "FIXED" | "PERCENTAGE"; value: number; min: number; max?: number; w: number; label: string };

export const WHEEL_PRIZES: WheelPrize[] = [
  { id: "p50", kind: "coupon", type: "FIXED", value: 50, min: 300, w: 0.003, label: "₪50 הנחה" },
  { id: "p20", kind: "coupon", type: "FIXED", value: 20, min: 150, w: 0.02, label: "₪20 הנחה" },
  { id: "pct5", kind: "coupon", type: "PERCENTAGE", value: 5, min: 0, max: 100, w: 0.015, label: "5% הנחה" },
  { id: "c5", kind: "coins", coins: 5, w: 0.25 },
  { id: "c10", kind: "coins", coins: 10, w: 0.3 },
  { id: "c15", kind: "coins", coins: 15, w: 0.18 },
  { id: "c20", kind: "coins", coins: 20, w: 0.13 },
  { id: "c30", kind: "coins", coins: 30, w: 0.08 },
  { id: "c100", kind: "coins", coins: 100, w: 0.022 },
];

export const COUPON_DAYS = 7;
export const DAILY_COUPON_CAP = 15;

/** The customer's calendar day, in Israel, whatever the server's clock zone. */
export function israelDay(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function roll(): WheelPrize {
  const total = WHEEL_PRIZES.reduce((s, p) => s + p.w, 0);
  let r = (randomInt(0, 1_000_000) / 1_000_000) * total;
  for (const p of WHEEL_PRIZES) {
    r -= p.w;
    if (r < 0) return p;
  }
  return WHEEL_PRIZES[WHEEL_PRIZES.length - 1];
}

const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function newCode(): string {
  const b = randomBytes(6);
  return "GAME-" + Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export type SpinResult =
  | { prize: "coins"; id: string; coins: number }
  | { prize: "coupon"; id: string; code: string; label: string; min: number; endsAt: string };

function toResult(p: WheelPrize, code?: string | null, endsAt?: Date): SpinResult {
  if (p.kind === "coins") return { prize: "coins", id: p.id, coins: p.coins };
  return { prize: "coupon", id: p.id, code: code ?? "", label: p.label, min: p.min, endsAt: (endsAt ?? new Date()).toISOString() };
}

/** Today's spin for this account, if there was one. */
export async function todaysSpin(userId: string): Promise<SpinResult | null> {
  const spin = await db.gameSpin.findUnique({ where: { userId_day: { userId, day: israelDay() } } });
  if (!spin) return null;
  const p = WHEEL_PRIZES.find((x) => x.id === spin.prize) ?? WHEEL_PRIZES[3];
  if (p.kind === "coupon" && spin.code) {
    const promo = await db.promotion.findUnique({ where: { code: spin.code }, select: { endsAt: true } });
    return toResult(p, spin.code, promo?.endsAt ?? undefined);
  }
  return toResult(p);
}

/**
 * Spin once for today. Returns the existing result when the account has
 * already spun (the unique key makes a double tap or a replay harmless).
 */
export async function spinWheel(userId: string): Promise<{ result: SpinResult; fresh: boolean }> {
  const day = israelDay();
  const existing = await todaysSpin(userId);
  if (existing) return { result: existing, fresh: false };

  let prize = roll();
  if (prize.kind === "coupon") {
    const given = await db.gameSpin.count({ where: { day, code: { not: null } } });
    if (given >= DAILY_COUPON_CAP) prize = WHEEL_PRIZES.find((p) => p.id === "c20")!;
  }

  if (prize.kind === "coins") {
    try {
      await db.gameSpin.create({ data: { userId, day, prize: prize.id } });
    } catch {
      const again = await todaysSpin(userId);
      if (again) return { result: again, fresh: false };
      throw new Error("spin failed");
    }
    return { result: toResult(prize), fresh: true };
  }

  const endsAt = new Date(Date.now() + COUPON_DAYS * 86_400_000);
  let code = newCode();
  for (let i = 0; i < 5 && (await db.promotion.findUnique({ where: { code } })); i++) code = newCode();
  try {
    // The spin row first: if two taps race, the unique key lets exactly one of them create a coupon.
    await db.gameSpin.create({ data: { userId, day, prize: prize.id, code } });
  } catch {
    const again = await todaysSpin(userId);
    if (again) return { result: again, fresh: false };
    throw new Error("spin failed");
  }
  await db.promotion.create({
    data: {
      name: `גלגל הקניון · ${prize.label}`,
      code,
      type: prize.type,
      value: prize.value,
      scope: "CART",
      minCartAmount: prize.min || null,
      maxDiscount: prize.max ?? null,
      startsAt: new Date(),
      endsAt,
      isActive: true,
    },
  });
  return { result: toResult(prize, code, endsAt), fresh: true };
}

/** A wheel coupon is good for one paid order; after it, it is switched off. */
export async function retireGameCoupon(code: string | null | undefined): Promise<void> {
  if (!code || !code.startsWith("GAME-")) return;
  await db.promotion.updateMany({ where: { code }, data: { isActive: false } }).catch(() => {});
}
