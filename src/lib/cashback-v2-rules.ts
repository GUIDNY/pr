import { DESTRUCTIVE_ORDER_STATUSES } from "@/lib/enums";

/**
 * Cashback v2 — the rules, with no database in them.
 *
 * What v1 (game-levels.ts) does and this changes, only when
 * CASHBACK_V2_ENABLED is "true":
 *
 *   1. A credit under ₪5 is no longer dropped. Every member order's credit
 *      is added to the account's cashback balance, to the agora, and a
 *      coupon is issued when the balance reaches ₪5.
 *   2. The credit is recorded at payment as PENDING and joins the balance
 *      CASHBACK_RELEASE_DAYS after the order was delivered. An order
 *      cancelled or returned before that loses its pending credit.
 *   3. An order refunded after its credit was released is clawed back from
 *      the balance, never from the refund itself, and the balance may go
 *      below zero: the next cashback pays the debt off first (agent 06,
 *      ECONOMY-V2-LAW-2026-11-25 s.5).
 *
 * Everything that moves money is one keyed, append-only ledger row, so a
 * replayed Pelecard callback or an overlapping cron run can repeat any step
 * and nothing happens twice. The store below is that ledger as an interface:
 * lib/cashback-v2.ts implements it over Prisma, scripts/check-cashback-v2.ts
 * implements it in memory and walks the rules without a database.
 *
 *   4. A level gift (₪20 at level 3 and so on) follows the same road as the
 *      cashback of the order that crossed the level: pending at payment, a
 *      coupon 14 days after delivery, nothing if the order is cancelled or
 *      returned first. A gift never touches the balance — it is its own
 *      coupon with its own minimum cart, as in v1.
 *
 * The percentages and gifts per level are not here and did not change: TIERS
 * in club-tiers.ts.
 */

// ---------- configuration ----------

/** The switch. Anything but the exact word "true" is off. */
export const CASHBACK_V2_FLAG = "CASHBACK_V2_ENABLED";
export function cashbackV2Enabled(env: Record<string, string | undefined> = process.env): boolean {
  return env[CASHBACK_V2_FLAG]?.trim().toLowerCase() === "true";
}

/** v1: a credit under this many shekels is not issued. v2: the balance at
    which a coupon is issued. */
export const MIN_CASHBACK = 5;
/** How long a cashback coupon is good for, both versions. */
export const CASHBACK_DAYS = 90;
/** Days after delivery until a pending credit can be used. */
export const CASHBACK_RELEASE_DAYS = 14;
/**
 * The way out for an order nobody ever marks as delivered. "Delivered" is a
 * click in the back office (closeOrderAction), and an order that is paid,
 * handed over and never closed would keep its credit pending for ever. So a
 * credit whose order is still paid, not cancelled or refunded, and has no
 * delivery time is released this many days after the payment. It is longer
 * than any delivery plus the 14 days, so an order still inside its return
 * window is not what this catches. An order that is DELIVERED with a delivery
 * time always waits for CASHBACK_RELEASE_DAYS after it and never takes this
 * road.
 *
 * The env var of the same name overrides it: a whole number of days, at
 * least CASHBACK_RELEASE_DAYS; "0" or "off" switches the fallback off.
 * Anything else is ignored and the default stands.
 */
export const CASHBACK_FALLBACK_RELEASE_DAYS = 45;
export const CASHBACK_FALLBACK_FLAG = "CASHBACK_FALLBACK_RELEASE_DAYS";
/** Days after payment, or null when the fallback is switched off. */
export function fallbackReleaseDays(env: Record<string, string | undefined> = process.env): number | null {
  const raw = env[CASHBACK_FALLBACK_FLAG]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return CASHBACK_FALLBACK_RELEASE_DAYS;
  if (raw === "0" || raw === "off") return null;
  if (!/^\d{1,4}$/.test(raw)) return CASHBACK_FALLBACK_RELEASE_DAYS;
  const days = Number(raw);
  return days >= CASHBACK_RELEASE_DAYS ? days : CASHBACK_FALLBACK_RELEASE_DAYS;
}
/** A v2 coupon of ₪X needs a cart of at least X × this. 0 = no minimum,
    which is what a v1 cashback coupon has today. */
export const CASHBACK_MIN_CART_FACTOR = 0;
/**
 * Optional: scale the level's rate for a category, by Category.slug — a
 * product's own category first, then its parent department. Anything not
 * listed is 1, so an empty table is exactly the level's rate. 0 means the
 * category earns nothing; 0.5 is half the rate. The numbers are Idan's to
 * give (real margin per category); until then this stays empty.
 */
export const CASHBACK_CATEGORY_MULTIPLIER: Record<string, number> = {};

// ---------- what the customer is told ----------

/**
 * The club page's headline for a member's own rate. "On every purchase" is
 * only true when no credit is dropped, which is v2: v1 issues nothing under
 * ₪5, and agent 06 (ECONOMY-V2-LAW-2026-11-25 s.5) ruled the phrase out for
 * as long as that is so.
 */
export function cashbackHeadline(rate: number, v2: boolean): string {
  return v2 ? `${rate}% קאשבק על כל קנייה` : `${rate}% קאשבק ברכישות לחברי מועדון`;
}

/** Agent 06's sentence for the terms, word for word, with the number of days
    taken from the constant so the page cannot drift from the code. */
export const CASHBACK_PENDING_RULE = `הזיכוי ניתן בתנאי שההזמנה לא בוטלה. הוא נכנס לשימוש ${CASHBACK_RELEASE_DAYS} יום אחרי המסירה. אם ההזמנה בוטלה או הוחזרה לפני כן, הזיכוי מבוטל.`;

// ---------- how much ----------

export type CashbackLine = {
  /** priceSnap × quantity */
  amount: number;
  /** The product's category slug, then its parent's. */
  categorySlugs: (string | null | undefined)[];
};

/** One multiplier for an order: each line's, weighted by what it cost. */
export function orderMultiplier(
  lines: CashbackLine[],
  table: Record<string, number> = CASHBACK_CATEGORY_MULTIPLIER,
): number {
  let weight = 0;
  let sum = 0;
  for (const line of lines) {
    if (!(line.amount > 0)) continue;
    const slug = line.categorySlugs.find((s) => s != null && Object.hasOwn(table, s));
    const raw = slug == null ? 1 : table[slug];
    const m = Number.isFinite(raw) && raw >= 0 ? raw : 1;
    weight += line.amount;
    sum += line.amount * m;
  }
  return weight > 0 ? sum / weight : 1;
}

export type CashbackPlan =
  /** v1: a coupon of this many whole shekels, now. */
  | { mode: "v1-coupon"; credit: number }
  /** v1: under the minimum, nothing is issued. */
  | { mode: "v1-none" }
  /** v2: this many agorot, pending. */
  | { mode: "v2-pending"; agorot: number }
  | { mode: "v2-none" };

/**
 * What a paid order of `total` shekels earns at `rate` percent. The v1 branch
 * is the arithmetic game-levels.ts has always done, moved here unchanged so
 * that "flag off = old behaviour" is something a check can state.
 */
export function planCashback(total: number, rate: number, v2: boolean, multiplier = 1): CashbackPlan {
  if (!v2) {
    const credit = Math.floor((total * rate) / 100);
    return credit >= MIN_CASHBACK ? { mode: "v1-coupon", credit } : { mode: "v1-none" };
  }
  // total is shekels and rate is percent, so their product is agorot
  const agorot = Math.floor((Math.round(total * 100) * rate * multiplier) / 100 + 1e-6);
  return agorot > 0 ? { mode: "v2-pending", agorot } : { mode: "v2-none" };
}

// ---------- when ----------

/** The order as the settlement sees it; null = the row is gone. */
export type OrderState = { status: string; paymentStatus: string; deliveredAt: Date | null } | null;

const PAID = ["CAPTURED", "AUTHORIZED"];

/** Cancelled, in refund, refunded, unpaid again, or deleted — the same
    orders purchaseLevel does not count. */
export function isReversed(order: OrderState): boolean {
  return (
    !order ||
    (DESTRUCTIVE_ORDER_STATUSES as string[]).includes(order.status) ||
    !PAID.includes(order.paymentStatus)
  );
}

export type SettleOptions = {
  /** Days after delivery; CASHBACK_RELEASE_DAYS unless a check says otherwise. */
  days?: number;
  /** When the credit was recorded, which is when the order was paid. */
  earnedAt?: Date | null;
  /** Days after `earnedAt` for an order with no delivery time; null = never.
      Left out, there is no fallback: the caller has to ask for it. */
  fallbackDays?: number | null;
};

export function decideSettlement(order: OrderState, now: Date, options: SettleOptions = {}): "release" | "void" | "wait" {
  const { days = CASHBACK_RELEASE_DAYS, earnedAt = null, fallbackDays = null } = options;
  if (isReversed(order)) return "void";
  if (order!.status === "DELIVERED" && order!.deliveredAt) {
    return now.getTime() - order!.deliveredAt.getTime() >= days * 86_400_000 ? "release" : "wait";
  }
  /* Paid, not reversed, and not delivered as far as the shop's records go:
     still on its way, DELIVERED from the old status menu with no time
     anywhere, or a delivery that was undone and never marked again. */
  if (fallbackDays != null && earnedAt && now.getTime() - earnedAt.getTime() >= fallbackDays * 86_400_000) {
    return "release";
  }
  return "wait";
}

// ---------- the ledger ----------

export type LedgerType =
  | "EARN"
  | "RELEASE"
  | "VOID"
  | "CLAWBACK"
  | "ISSUE"
  | "COUPON_VOID"
  /* Level gifts. None of these moves the balance; `amount` is the gift's
     value in agorot, for the record. */
  | "GIFT_EARN"
  | "GIFT_RELEASE"
  | "GIFT_VOID"
  | "GIFT_CLAWBACK";

/** The rows CashbackAccount.balance is the sum of. */
export const BALANCE_TYPES: LedgerType[] = ["RELEASE", "CLAWBACK", "ISSUE", "COUPON_VOID"];

export type LedgerRow = {
  key: string;
  userId: string;
  type: LedgerType;
  /** agorot, signed as it moves the balance */
  amount: number;
  orderId?: string | null;
  couponCode?: string | null;
  note?: string | null;
};

export const cashbackKey = {
  earn: (orderId: string) => `earn:${orderId}`,
  /** RELEASE and VOID share it: an order gets one or the other, once. */
  settle: (orderId: string) => `settle:${orderId}`,
  clawback: (orderId: string) => `clawback:${orderId}`,
  issue: (code: string) => `issue:${code}`,
  couponVoid: (code: string) => `couponvoid:${code}`,
  /* A gift is keyed by the order that crossed the level AND the level: one
     big order can cross several. The three share their tail on purpose — the
     settlement query finds a gift's settle row by swapping the prefix. */
  giftEarn: (orderId: string, level: number) => `giftearn:${orderId}:${level}`,
  giftSettle: (orderId: string, level: number) => `giftsettle:${orderId}:${level}`,
  giftClawback: (orderId: string, level: number) => `giftclaw:${orderId}:${level}`,
};

export interface CashbackStore {
  /** Write one row and move the balance by `balanceDelta`, together or not
      at all. False when a row with this key already exists. */
  append(row: LedgerRow, balanceDelta: number): Promise<boolean>;
  balance(userId: string): Promise<number>;
  /** If the balance is still exactly `expectedBalance`: take `agorot` off it,
      create the coupon and its ISSUE row, all in one step, and return the
      code. Null when the balance moved in the meantime. */
  issueCoupon(spec: {
    userId: string;
    expectedBalance: number;
    agorot: number;
    valueNis: number;
    minCart: number;
    days: number;
  }): Promise<string | null>;
  /** Switch off one of the account's unused v2 coupons and put its value
      back on the balance. Returns the agorot returned, null if none is left. */
  reclaimCoupon(userId: string): Promise<number | null>;
  /** Create the level's gift coupon and its GIFT_RELEASE row under `key`,
      together. Null when the key exists: this gift was already settled. */
  releaseGift(spec: { key: string; userId: string; orderId: string; level: number; agorot: number }): Promise<string | null>;
  /** A released gift whose order was refunded: switch its coupon off if it is
      still unused and write the GIFT_CLAWBACK row under `key`, together.
      "spent" — it was used already (or ran out), only the row is written;
      "busy"  — it sits on an order on its way to being paid, nothing is
                written and the next run looks again;
      "already" — the key exists. */
  takeBackGift(spec: {
    key: string;
    userId: string;
    orderId: string;
    couponCode: string | null;
    agorot: number;
  }): Promise<"taken" | "spent" | "busy" | "already">;
}

export type PendingEntry = {
  orderId: string;
  userId: string;
  amount: number;
  /** When the EARN row was written; needed only for the never-delivered fallback. */
  earnedAt?: Date | null;
};

/** At payment. Not in the balance yet. */
export async function earnCashback(
  store: CashbackStore,
  order: { id: string; userId: string },
  agorot: number,
  note?: string,
): Promise<boolean> {
  if (!(agorot > 0)) return false;
  return store.append(
    { key: cashbackKey.earn(order.id), userId: order.userId, type: "EARN", amount: agorot, orderId: order.id, note },
    0,
  );
}

/** A coupon for the whole shekels of the balance, once it reaches the minimum. */
export async function issueIfDue(store: CashbackStore, userId: string): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const balance = await store.balance(userId);
    if (balance < MIN_CASHBACK * 100) return null;
    const valueNis = Math.floor(balance / 100);
    const code = await store.issueCoupon({
      userId,
      expectedBalance: balance,
      agorot: valueNis * 100,
      valueNis,
      minCart: valueNis * CASHBACK_MIN_CART_FACTOR,
      days: CASHBACK_DAYS,
    });
    if (code) return code;
  }
  return null;
}

/** A pending credit and its order today: release it, void it, or leave it. */
export async function settlePending(
  store: CashbackStore,
  entry: PendingEntry,
  order: OrderState,
  now: Date,
  fallbackDays: number | null = null,
): Promise<"released" | "voided" | "waiting" | "already"> {
  const decision = decideSettlement(order, now, { earnedAt: entry.earnedAt, fallbackDays });
  if (decision === "wait") return "waiting";
  const key = cashbackKey.settle(entry.orderId);
  if (decision === "void") {
    const wrote = await store.append(
      { key, userId: entry.userId, type: "VOID", amount: entry.amount, orderId: entry.orderId },
      0,
    );
    return wrote ? "voided" : "already";
  }
  const wrote = await store.append(
    { key, userId: entry.userId, type: "RELEASE", amount: entry.amount, orderId: entry.orderId },
    entry.amount,
  );
  if (!wrote) return "already";
  await issueIfDue(store, entry.userId);
  return "released";
}

/**
 * A released credit whose order was refunded afterwards. The credit comes
 * off the balance, which may go below zero; unused coupons are then taken
 * back, newest first, until the debt is covered. A coupon that was already
 * spent stays spent and the customer's refund is not touched.
 */
export async function clawBack(
  store: CashbackStore,
  entry: PendingEntry,
  order: OrderState,
): Promise<"clawed" | "kept" | "already"> {
  if (!isReversed(order)) return "kept";
  const wrote = await store.append(
    {
      key: cashbackKey.clawback(entry.orderId),
      userId: entry.userId,
      type: "CLAWBACK",
      amount: -entry.amount,
      orderId: entry.orderId,
    },
    -entry.amount,
  );
  if (!wrote) return "already";
  for (let i = 0; i < 10 && (await store.balance(entry.userId)) < 0; i++) {
    if ((await store.reclaimCoupon(entry.userId)) === null) break;
  }
  // a reclaimed coupon may have been worth more than the debt
  await issueIfDue(store, entry.userId);
  return "clawed";
}

// ---------- level gifts ----------

export type GiftEntry = {
  orderId: string;
  userId: string;
  level: number;
  /** the gift's value, agorot */
  amount: number;
  earnedAt?: Date | null;
};

/** At payment, by the order that crossed the level. Not a coupon yet. */
export async function earnGift(
  store: CashbackStore,
  order: { id: string; userId: string },
  level: number,
  valueNis: number,
): Promise<boolean> {
  if (!(valueNis > 0)) return false;
  return store.append(
    {
      key: cashbackKey.giftEarn(order.id, level),
      userId: order.userId,
      type: "GIFT_EARN",
      amount: Math.round(valueNis * 100),
      orderId: order.id,
      note: `מתנת רמה ${level}`,
    },
    0,
  );
}

/** A pending gift and its order today — the same decision as its cashback. */
export async function settleGift(
  store: CashbackStore,
  entry: GiftEntry,
  order: OrderState,
  now: Date,
  fallbackDays: number | null = null,
): Promise<"released" | "voided" | "waiting" | "already"> {
  const decision = decideSettlement(order, now, { earnedAt: entry.earnedAt, fallbackDays });
  if (decision === "wait") return "waiting";
  const key = cashbackKey.giftSettle(entry.orderId, entry.level);
  if (decision === "void") {
    const wrote = await store.append(
      { key, userId: entry.userId, type: "GIFT_VOID", amount: entry.amount, orderId: entry.orderId },
      0,
    );
    return wrote ? "voided" : "already";
  }
  const code = await store.releaseGift({
    key,
    userId: entry.userId,
    orderId: entry.orderId,
    level: entry.level,
    agorot: entry.amount,
  });
  return code ? "released" : "already";
}

/**
 * A released gift whose order was refunded afterwards. If its coupon is still
 * unused it is switched off. If it was already spent, that is recorded and
 * nothing else happens: a gift is not part of the balance, so it leaves no
 * debt, and the customer's refund is never touched.
 */
export async function clawBackGift(
  store: CashbackStore,
  entry: GiftEntry & { couponCode: string | null },
  order: OrderState,
): Promise<"taken" | "spent" | "busy" | "kept" | "already"> {
  if (!isReversed(order)) return "kept";
  return store.takeBackGift({
    key: cashbackKey.giftClawback(entry.orderId, entry.level),
    userId: entry.userId,
    orderId: entry.orderId,
    couponCode: entry.couponCode,
    agorot: entry.amount,
  });
}
