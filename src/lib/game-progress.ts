/**
 * The 3D mall's progress — level points, coins, the shirts and hats bought
 * with them, the daily wheel — kept against the account so it follows the
 * player to any device, like the character in game-profile.ts.
 *
 * Rebuilt key by key like the character, never stored as sent. Every value
 * is cosmetic: coins buy clothes for a figure in a game and nothing else,
 * so a player who edits their own numbers gains a hat. THAT IS A RULE FOR
 * THE FUTURE TOO: the day coins or levels are worth anything in the shop (a
 * coupon, a price), they must be earned and counted on the server, not
 * reported by the game as they are here.
 */
export type GameProgress = {
  xp: number;
  coins: number;
  owned: string[];
  got: number[];
  streak: number;
  day: string;
  spin: string;
  shared: string;
};

const SHOP_IDS = new Set(["bt-orange", "bt-navy", "jersey", "gold", "vip", "diamond", "beanie", "shades", "headphones", "crown"]);
const DAY = /^\d{4}-\d{1,2}-\d{1,2}$/;
const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);
const day = (v: unknown) => (v === undefined || v === "" ? "" : typeof v === "string" && DAY.test(v) ? v : null);

export function parseGameProgress(input: unknown): GameProgress | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  const xp = int(o.xp, 10_000_000);
  const coins = int(o.coins, 10_000_000);
  const streak = int(o.streak ?? 0, 10_000);
  const d = day(o.day), spin = day(o.spin), shared = day(o.shared);
  if (xp === null || coins === null || streak === null || d === null || spin === null || shared === null) return null;
  if (!Array.isArray(o.owned) || !Array.isArray(o.got ?? [])) return null;
  const owned = [...new Set((o.owned as unknown[]).filter((x): x is string => typeof x === "string" && SHOP_IDS.has(x)))];
  const got = [...new Set(((o.got ?? []) as unknown[]).filter((x): x is number => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 10))];
  return { xp, coins, owned, got, streak, day: d, spin, shared };
}
