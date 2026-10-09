import "server-only";
import { randomInt } from "crypto";
import { db } from "@/lib/db";
import { israelDay } from "@/lib/game-wheel";
import { issueMemberCoupon, type IssuedCoupon } from "@/lib/member-coupons";

/**
 * The 3D mall's prize machine (the claw): one free play a day per account.
 *
 * WHAT IT PAYS. The play itself pays game coins, decided in the game by how
 * well the claw was aimed: they buy clothes for a figure in a game and nothing
 * else (see lib/game-wheel.ts on why chance must never pay shekels).
 *
 * THE REAL GIFT. A gift worth money handed out by chance is a "lottery" under
 * the Penal Law (§224) even when the play is free, and the Ministry of
 * Finance's general permit for promotional lotteries allows it only as a
 * campaign: an appointed supervisor (lawyer or accountant), rules published in
 * advance, a report afterwards, at most two campaigns a year with 120 days
 * between them. So CLAW_CAMPAIGN is null — no gift at all — until such a
 * campaign is set up; then it names its dates, odds (e.g. 1 in 2000 plays),
 * the gift, and where its rules are published.
 *
 * THE COUNT. A play is a GameSpin row with day "claw:YYYY-MM-DD" (Israel's
 * calendar day): the same one-a-day unique key the wheel uses, without a new
 * table. The wheel's own counts leave these rows out (checkinStatus).
 */

export type ClawCampaign = { from: string; to: string; odds: number; value: number; min: number; label: string; rulesUrl: string };

export const CLAW_CAMPAIGN: ClawCampaign | null = null;

export const CLAW_PREFIX = "claw:";
const clawDay = (day = israelDay()) => CLAW_PREFIX + day;

export async function clawStatus(userId: string) {
  const rows = await db.gameSpin.findMany({ where: { userId, day: { startsWith: CLAW_PREFIX } }, select: { day: true } });
  return { playedToday: rows.some((r) => r.day === clawDay()), plays: rows.length };
}

/** Today's play: taken once (a second call the same day changes nothing), and the campaign's draw if one is running. */
export async function clawPlay(userId: string) {
  const day = clawDay();
  try {
    await db.gameSpin.create({ data: { userId, day, prize: "claw" } });
  } catch {
    return { fresh: false, gift: null, ...(await clawStatus(userId)) };
  }
  let gift: (IssuedCoupon & { label: string }) | null = null;
  const c = CLAW_CAMPAIGN, today = israelDay();
  if (c && today >= c.from && today <= c.to && randomInt(0, c.odds) === 0) {
    gift = await issueMemberCoupon({ userId, kind: "claw", label: c.label, rule: `מכונת המתנות · ${c.rulesUrl}`, type: "FIXED", value: c.value, min: c.min, days: 30 });
    await db.gameSpin.update({ where: { userId_day: { userId, day } }, data: { prize: "claw+gift", code: gift.code } });
  }
  return { fresh: true, gift: gift ? { label: gift.label, code: gift.code } : null, ...(await clawStatus(userId)) };
}
