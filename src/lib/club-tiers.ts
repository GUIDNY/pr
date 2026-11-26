/**
 * The club's level table, with no database in it, so the rules files and the
 * check scripts can read the same numbers the server awards from. The code
 * that counts a customer's level from their orders is game-levels.ts, which
 * re-exports everything here.
 */
export type Tier = { level: number; spend: number; cashback: number; gift?: { value: number; min: number } };

export const TIERS: Tier[] = [
  { level: 1, spend: 0, cashback: 0 },
  { level: 2, spend: 1, cashback: 1 },
  { level: 3, spend: 500, cashback: 1.5, gift: { value: 20, min: 200 } },
  { level: 4, spend: 1000, cashback: 2 },
  { level: 5, spend: 2000, cashback: 2.5, gift: { value: 50, min: 400 } },
  { level: 6, spend: 3500, cashback: 3 },
  { level: 7, spend: 5000, cashback: 3.5, gift: { value: 100, min: 700 } },
  { level: 8, spend: 8000, cashback: 4 },
  { level: 9, spend: 12000, cashback: 4.5 },
  { level: 10, spend: 20000, cashback: 5, gift: { value: 250, min: 1500 } },
];
export const LEVEL_SPEND = TIERS.map((t) => t.spend);
/** How long a level gift's coupon is good for. */
export const GIFT_DAYS = 30;

export const levelFor = (spent: number) => [...TIERS].reverse().find((t) => spent >= t.spend && (t.spend > 0 || spent === 0 || t.level === 1))!.level;
