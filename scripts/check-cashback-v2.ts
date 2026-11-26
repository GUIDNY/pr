/**
 * Cashback v2 (src/lib/cashback-v2-rules.ts), behind CASHBACK_V2_ENABLED.
 *
 * What it promises, each walked here against an in-memory ledger that keeps
 * the same three guarantees the database one does — a key is written once,
 * a coupon is issued only against the balance it was worked out from, and a
 * row and its balance change land together:
 *
 *   - a small order's credit is kept and adds up, instead of being dropped
 *   - crossing ₪5 issues a coupon for the whole shekels, the agorot stay
 *   - a credit is pending until 14 days after delivery
 *   - cancel / refund before that voids it; after that it is clawed back
 *     from the balance (which may go below zero), never from the refund
 *   - a replayed callback or cron run changes nothing
 *   - with the flag off, the arithmetic is v1's: floor(total × rate%) in
 *     whole shekels, nothing under ₪5 — and members only either way
 *
 * No database and no network, like the other checks here.
 *
 *   npm run check:cashback
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  BALANCE_TYPES,
  CASHBACK_CATEGORY_MULTIPLIER,
  CASHBACK_PENDING_RULE,
  cashbackHeadline,
  CASHBACK_FALLBACK_RELEASE_DAYS,
  CASHBACK_RELEASE_DAYS,
  MIN_CASHBACK,
  cashbackV2Enabled,
  clawBack,
  clawBackGift,
  decideSettlement,
  earnCashback,
  earnGift,
  settleGift,
  fallbackReleaseDays,
  issueIfDue,
  mallCashbackView,
  orderMultiplier,
  planCashback,
  settlePending,
  type CashbackStore,
  type LedgerRow,
  type OrderState,
} from "../src/lib/cashback-v2-rules";
import { GIFT_DAYS, TIERS, levelFor } from "../src/lib/club-tiers";

let failed = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

/** The ledger, in memory. `usedCoupons` is the test saying "this one was spent". */
function memoryStore() {
  const rows: LedgerRow[] = [];
  const balances = new Map<string, number>();
  const coupons: { code: string; userId: string; valueNis: number; minCart: number; active: boolean }[] = [];
  /** Level gift coupons. `busy` = sitting on an order that is being paid. */
  const gifts: { code: string; userId: string; level: number; valueNis: number; active: boolean; busy: boolean }[] = [];
  const store: CashbackStore = {
    async append(row, delta) {
      if (rows.some((r) => r.key === row.key)) return false;
      rows.push(row);
      balances.set(row.userId, (balances.get(row.userId) ?? 0) + delta);
      return true;
    },
    async balance(userId) {
      return balances.get(userId) ?? 0;
    },
    async issueCoupon({ userId, expectedBalance, agorot, valueNis, minCart }) {
      if ((balances.get(userId) ?? 0) !== expectedBalance) return null;
      const code = `GAME-TEST${coupons.length + 1}`;
      balances.set(userId, expectedBalance - agorot);
      coupons.push({ code, userId, valueNis, minCart, active: true });
      rows.push({ key: `issue:${code}`, userId, type: "ISSUE", amount: -agorot, couponCode: code });
      return code;
    },
    async reclaimCoupon(userId) {
      const c = [...coupons].reverse().find((x) => x.userId === userId && x.active);
      if (!c) return null;
      c.active = false;
      rows.push({ key: `couponvoid:${c.code}`, userId, type: "COUPON_VOID", amount: c.valueNis * 100, couponCode: c.code });
      balances.set(userId, (balances.get(userId) ?? 0) + c.valueNis * 100);
      return c.valueNis * 100;
    },
    async releaseGift({ key, userId, orderId, level, agorot }) {
      if (rows.some((r) => r.key === key)) return null;
      const code = `GAME-GIFT${gifts.length + 1}`;
      gifts.push({ code, userId, level, valueNis: agorot / 100, active: true, busy: false });
      rows.push({ key, userId, type: "GIFT_RELEASE", amount: agorot, orderId, couponCode: code });
      return code;
    },
    async takeBackGift({ key, userId, orderId, couponCode, agorot }) {
      if (rows.some((r) => r.key === key)) return "already";
      const g = gifts.find((x) => x.code === couponCode);
      if (g?.active && g.busy) return "busy";
      if (g?.active) {
        g.active = false;
        rows.push({ key, userId, type: "GIFT_CLAWBACK", amount: -agorot, orderId, couponCode });
        return "taken";
      }
      rows.push({ key, userId, type: "GIFT_CLAWBACK", amount: 0, orderId });
      return "spent";
    },
  };
  /** The balance must always be what the ledger's balance rows add up to. */
  const ledgerSum = (userId: string) =>
    rows
      .filter((r) => r.userId === userId && BALANCE_TYPES.includes(r.type))
      .reduce((s, r) => s + r.amount, 0);
  return { store, rows, coupons, gifts, ledgerSum };
}

const day = 86_400_000;
const T0 = new Date("2026-12-01T10:00:00Z");
const after = (days: number) => new Date(T0.getTime() + days * day);
const paid: OrderState = { status: "PROCESSING", paymentStatus: "CAPTURED", deliveredAt: null };
const delivered: OrderState = { status: "DELIVERED", paymentStatus: "CAPTURED", deliveredAt: T0 };
const refunded: OrderState = { status: "REFUNDED", paymentStatus: "REFUNDED", deliveredAt: T0 };
const U = "user-1";
const entry = (orderId: string, amount: number) => ({ orderId, userId: U, amount });

async function main() {
  console.log("\nThe switch is off unless it says true");
  is("unset", cashbackV2Enabled({}), false);
  is("empty", cashbackV2Enabled({ CASHBACK_V2_ENABLED: "" }), false);
  is("false", cashbackV2Enabled({ CASHBACK_V2_ENABLED: "false" }), false);
  is("1 is not true", cashbackV2Enabled({ CASHBACK_V2_ENABLED: "1" }), false);
  is("true", cashbackV2Enabled({ CASHBACK_V2_ENABLED: "true" }), true);
  is("TRUE with a space", cashbackV2Enabled({ CASHBACK_V2_ENABLED: " TRUE " }), true);

  console.log("\nFlag off = old behaviour");
  is("₪499 at 1% is ₪4: dropped", planCashback(499, 1, false), { mode: "v1-none" });
  is("₪500 at 1% is a ₪5 coupon", planCashback(500, 1, false), { mode: "v1-coupon", credit: 5 });
  is("₪1,234.50 at 2.5% floors to ₪30", planCashback(1234.5, 2.5, false), { mode: "v1-coupon", credit: 30 });
  is("level 1 earns nothing", planCashback(5000, 0, false), { mode: "v1-none" });
  is("a multiplier is ignored by v1", planCashback(500, 1, false, 3), { mode: "v1-coupon", credit: 5 });
  const levels = readFileSync(join(import.meta.dirname, "../src/lib/game-levels.ts"), "utf8");
  const guest = levels.indexOf("if (!order?.userId) return;");
  const gate = levels.indexOf("if (cashbackV2Enabled())");
  is("awardPurchase asks the switch", gate > 0, true);
  is("guests are turned away before either version runs", guest > 0 && guest < gate, true);
  is("v1 still issues through issueMemberCoupon", /plan\.mode === "v1-coupon"\) \{\s+await issueMemberCoupon\(/.test(levels), true);
  is("game-levels never touches the v2 tables itself", /cashbackLedger|cashbackAccount/.test(levels), false);
  is("the multiplier table ships empty", CASHBACK_CATEGORY_MULTIPLIER, {});

  console.log("\nv2 keeps the agorot");
  is("₪80 at 1% is 80 agorot", planCashback(80, 1, true), { mode: "v2-pending", agorot: 80 });
  is("₪349.90 at 1.5% is 524 agorot", planCashback(349.9, 1.5, true), { mode: "v2-pending", agorot: 524 });
  is("₪500 at 1% is the same ₪5 as v1", planCashback(500, 1, true), { mode: "v2-pending", agorot: 500 });
  is("level 1 earns nothing", planCashback(5000, 0, true), { mode: "v2-none" });
  is("half-rate category", planCashback(1000, 2, true, 0.5), { mode: "v2-pending", agorot: 1000 });

  console.log("\nCategory multiplier defaults to 1");
  const lines = [
    { amount: 3000, categorySlugs: ["fridges-side-by-side", "fridges"] },
    { amount: 1000, categorySlugs: ["cables", "accessories"] },
  ];
  is("empty table", orderMultiplier(lines), 1);
  is("unlisted categories", orderMultiplier(lines, { ovens: 0.5 }), 1);
  is("a department's number covers its leaf", orderMultiplier(lines, { fridges: 0.5 }), 0.625);
  is("the leaf's own number wins", orderMultiplier(lines, { fridges: 0.5, "fridges-side-by-side": 0 }), 0.25);
  is("a nonsense number counts as 1", orderMultiplier(lines, { fridges: -2, cables: NaN }), 1);
  is("no lines", orderMultiplier([]), 1);

  console.log("\nWhen a pending credit moves");
  is("not delivered yet", decideSettlement(paid, after(60)), "wait");
  is("delivered 13 days ago", decideSettlement(delivered, after(13)), "wait");
  is(`delivered ${CASHBACK_RELEASE_DAYS} days ago`, decideSettlement(delivered, after(CASHBACK_RELEASE_DAYS)), "release");
  is("DELIVERED with no delivery time waits", decideSettlement({ ...delivered!, deliveredAt: null }, after(60)), "wait");
  is("cancelled", decideSettlement({ ...paid!, status: "CANCELLED" }, after(1)), "void");
  is("refund pending", decideSettlement({ ...delivered!, status: "REFUND_PENDING" }, after(30)), "void");
  is("refunded", decideSettlement(refunded, after(30)), "void");
  is("payment failed after all", decideSettlement({ ...paid!, paymentStatus: "FAILED" }, after(1)), "void");
  is("the order row is gone", decideSettlement(null, after(1)), "void");

  console.log("\nAn order nobody marks as delivered does not keep its credit for ever");
  {
    const F = CASHBACK_FALLBACK_RELEASE_DAYS;
    const fb = { earnedAt: T0, fallbackDays: F };
    is("the default is 45 days", F, 45);
    is("and it is longer than the pending period", F > CASHBACK_RELEASE_DAYS, true);
    is("no fallback unless the caller asks", decideSettlement(paid, after(400)), "wait");
    is("paid 44 days ago, never delivered", decideSettlement(paid, after(F - 1), fb), "wait");
    is("paid 45 days ago, never delivered", decideSettlement(paid, after(F), fb), "release");
    is("shipped counts the same", decideSettlement({ ...paid!, status: "SHIPPED" }, after(F), fb), "release");
    is("authorised, not yet captured, is paid", decideSettlement({ ...paid!, paymentStatus: "AUTHORIZED" }, after(F), fb), "release");
    is("DELIVERED with no time anywhere", decideSettlement({ ...delivered!, deliveredAt: null }, after(F), fb), "release");
    is("a delivery that was undone", decideSettlement({ ...paid!, deliveredAt: T0 }, after(F), fb), "release");
    is("cancelled is void however old", decideSettlement({ ...paid!, status: "CANCELLED" }, after(400), fb), "void");
    is("refunded is void however old", decideSettlement(refunded, after(400), fb), "void");
    is("never paid is void, not released", decideSettlement({ ...paid!, paymentStatus: "PENDING" }, after(400), fb), "void");
    const late = { ...delivered!, deliveredAt: after(40) };
    is("delivered on day 40: the 14 days run from the delivery", decideSettlement(late, after(F), fb), "wait");
    is("and end on day 54", decideSettlement(late, after(54), fb), "release");
    is("no payment time, no fallback", decideSettlement(paid, after(400), { fallbackDays: F }), "wait");
    is("switched off", decideSettlement(paid, after(400), { earnedAt: T0, fallbackDays: null }), "wait");
    is("env: unset", fallbackReleaseDays({}), 45);
    is("env: 60", fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: " 60 " }), 60);
    is("env: off", [fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: "0" }), fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: "OFF" })], [null, null]);
    is("env: shorter than the pending period is ignored", fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: "7" }), 45);
    is("env: nonsense is ignored", [fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: "soon" }), fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: "-3" }), fallbackReleaseDays({ CASHBACK_FALLBACK_RELEASE_DAYS: "4.5" })], [45, 45, 45]);

    const { store, coupons } = memoryStore();
    await earnCashback(store, { id: "f1", userId: U }, 900);
    const e = { ...entry("f1", 900), earnedAt: T0 };
    is("day 44: waiting", await settlePending(store, e, paid, after(F - 1), F), "waiting");
    is("day 45: released", await settlePending(store, e, paid, after(F), F), "released");
    is("coupon as usual", [coupons.map((c) => c.valueNis), await store.balance(U)], [[9], 0]);
    is("once", await settlePending(store, e, paid, after(F + 1), F), "already");
    is("refunded afterwards: clawed back like any other", await clawBack(store, e, refunded), "clawed");
  }

  console.log("\nA small order accumulates instead of being dropped");
  {
    const { store, coupons, ledgerSum } = memoryStore();
    const plan = planCashback(80, 1, true);
    const agorot = plan.mode === "v2-pending" ? plan.agorot : 0;
    is("recorded at payment", await earnCashback(store, { id: "o1", userId: U }, agorot), true);
    is("pending is not balance", await store.balance(U), 0);
    is("still pending before delivery", await settlePending(store, entry("o1", agorot), paid, after(5)), "waiting");
    is("released 14 days after delivery", await settlePending(store, entry("o1", agorot), delivered, after(14)), "released");
    is("80 agorot are kept", await store.balance(U), 80);
    is("no coupon under the minimum", coupons.length, 0);

    console.log("\nCrossing the threshold issues the credit");
    await earnCashback(store, { id: "o2", userId: U }, 450);
    is("second order released", await settlePending(store, entry("o2", 450), delivered, after(14)), "released");
    is("one coupon", coupons.map((c) => c.valueNis), [MIN_CASHBACK]);
    is("the agorot stay for next time", await store.balance(U), 30);
    is("balance equals the ledger", ledgerSum(U), 30);

    console.log("\nA retry does not double");
    is("the same payment callback again", await earnCashback(store, { id: "o2", userId: U }, 450), false);
    is("the same release again", await settlePending(store, entry("o2", 450), delivered, after(15)), "already");
    is("a refund cannot void what was released", await settlePending(store, entry("o2", 450), refunded, after(15)), "already");
    is("balance unchanged", await store.balance(U), 30);
    is("still one coupon", coupons.length, 1);
    is("nothing due under the minimum", await issueIfDue(store, U), null);
  }

  console.log("\nA coupon is only issued against the balance it was worked out from");
  {
    const { store, coupons } = memoryStore();
    await store.append({ key: "settle:x", userId: U, type: "RELEASE", amount: 700 }, 700);
    is("a stale balance is refused", await store.issueCoupon({ userId: U, expectedBalance: 650, agorot: 600, valueNis: 6, minCart: 0, days: 90 }), null);
    is("two issuers, one coupon", [await issueIfDue(store, U), await issueIfDue(store, U)].filter(Boolean).length, 1);
    is("₪7 coupon, nothing left", [coupons[0].valueNis, await store.balance(U)], [7, 0]);
  }

  console.log("\nA refund before release voids the pending credit");
  {
    const { store, coupons } = memoryStore();
    await earnCashback(store, { id: "o3", userId: U }, 2500);
    is("voided", await settlePending(store, entry("o3", 2500), refunded, after(3)), "voided");
    is("nothing reached the balance", await store.balance(U), 0);
    is("no coupon", coupons.length, 0);
    is("voided is final, even if the order is revived", await settlePending(store, entry("o3", 2500), delivered, after(30)), "already");
    is("still nothing", await store.balance(U), 0);
    is("the retry of the void", await settlePending(store, entry("o3", 2500), refunded, after(4)), "already");
  }

  console.log("\nA refund after release is clawed back from the balance, not from the refund");
  {
    const { store, coupons, ledgerSum } = memoryStore();
    await earnCashback(store, { id: "o4", userId: U }, 1260);
    await settlePending(store, entry("o4", 1260), delivered, after(14));
    is("₪12 coupon, 60 agorot left", [coupons[0].valueNis, await store.balance(U)], [12, 60]);
    is("order still fine: kept", await clawBack(store, entry("o4", 1260), delivered), "kept");
    is("refunded later: clawed", await clawBack(store, entry("o4", 1260), refunded), "clawed");
    is("the unused coupon was taken back", coupons[0].active, false);
    is("and the account is square", await store.balance(U), 0);
    is("the cron's second look", await clawBack(store, entry("o4", 1260), refunded), "already");
    is("balance equals the ledger", ledgerSum(U), 0);
  }
  {
    const { store, coupons, ledgerSum } = memoryStore();
    await earnCashback(store, { id: "o5", userId: U }, 1000);
    await settlePending(store, entry("o5", 1000), delivered, after(14));
    coupons[0].active = false; // the customer spent it on another order
    is("clawed", await clawBack(store, entry("o5", 1000), refunded), "clawed");
    is("a spent credit leaves a negative balance", await store.balance(U), -1000);
    await earnCashback(store, { id: "o6", userId: U }, 1300);
    await settlePending(store, entry("o6", 1300), delivered, after(14));
    is("the next cashback pays the debt first", await store.balance(U), 300);
    is("and no coupon until it is back over the minimum", coupons.length, 1);
    is("balance equals the ledger", ledgerSum(U), 300);
  }

  console.log("\nWhat the club page says");
  {
    const page = readFileSync(join(import.meta.dirname, "../src/app/(shop)/account/club/page.tsx"), "utf8");
    is("flag off: no 'on every purchase'", cashbackHeadline(2.5, false), "2.5% קאשבק ברכישות לחברי מועדון");
    is("flag on: small credits add up, so it is every purchase", cashbackHeadline(2.5, true), "2.5% קאשבק על כל קנייה");
    is("the page takes both headlines from there", (page.match(/cashbackHeadline\(tier\.cashback, v2On\)/g) ?? []).length, 2);
    is("and no longer says it by itself", /קאשבק על כל קנייה/.test(page), false);
    is("agent 06's sentence, with the days from the constant", CASHBACK_PENDING_RULE, "הזיכוי ניתן בתנאי שההזמנה לא בוטלה. הוא נכנס לשימוש 14 יום אחרי המסירה. אם ההזמנה בוטלה או הוחזרה לפני כן, הזיכוי מבוטל.");
    is("shown only inside the flag's block", /\{v2On && \(\s*<section[\s\S]*?\{CASHBACK_PENDING_RULE\}[\s\S]*?<\/section>\s*\)\}/.test(page), true);
    is("the summary is not read with the flag off", /v2On \? await cashbackSummary\(session\.sub\)/.test(page), true);
  }

  console.log("\nThe mall's read-only view (/api/game/cashback)");
  {
    is("a member part of the way", mallCashbackView({ balance: 380, pending: 300, pendingGifts: 2000 }, 3, 1.5), {
      balance: 380, pending: 300, pendingGifts: 2000, level: 3, percent: 1.5, minCredit: 500, toNextCredit: 120, releaseDays: 14,
    });
    is("nothing yet", mallCashbackView({ balance: 0, pending: 0, pendingGifts: 0 }, 1, 0).toNextCredit, 500);
    is("in debt: further to go", mallCashbackView({ balance: -2000, pending: 0, pendingGifts: 0 }, 4, 2).toNextCredit, 2500);
    is("never negative", mallCashbackView({ balance: 900, pending: 0, pendingGifts: 0 }, 4, 2).toNextCredit, 0);
    const route = readFileSync(join(import.meta.dirname, "../src/app/api/game/cashback/route.ts"), "utf8");
    const code = route.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    is("GET and the preflight, nothing that writes", (code.match(/export async function (\w+)/g) ?? []).map((x) => x.split(" ").pop()), ["OPTIONS", "GET"]);
    is("GET takes no request: no id, query or body can name another account", /export async function GET\(\)/.test(code), true);
    is("every read is for the session's own id", (code.match(/\((session\.sub)\)/g) ?? []).length, 2);
    is("no other id is in reach", /params|searchParams|userId|request/i.test(code), false);
    const order = ["if (!session) return", "if (!cashbackV2Enabled()) return", "rateLimit(", "cashbackSummary(session.sub)"].map((x) => code.indexOf(x));
    is("signed out, then the flag, then the limit, then the tables", order.every((x, i) => x > 0 && (i === 0 || x > order[i - 1])), true);
    is("answers through the game's CORS headers", /gameJson as json/.test(code) && /gameCorsHeaders\(\)/.test(code), true);
  }

  console.log("\nThe level table is the one the shop has always used");
  is("rates", TIERS.map((t) => t.cashback), [0, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  is("gifts", TIERS.filter((t) => t.gift).map((t) => [t.level, t.gift!.value, t.gift!.min]), [[3, 20, 200], [5, 50, 400], [7, 100, 700], [10, 250, 1500]]);
  is("gift coupons last 30 days", GIFT_DAYS, 30);
  is("levels by spend", [0, 1, 499, 500, 1999, 2000, 20000].map(levelFor), [1, 2, 2, 3, 4, 5, 10]);
  is("v1 gifts are still issued at once when the flag is off", /if \(cashbackV2Enabled\(\)\) \{\s+await recordPendingGift\([^)]*\);\s+continue;\s+\}\s+const kind = `level\$\{t\.level\}`;\s+if \(await hasMemberCoupon/.test(levels), true);

  console.log("\nA level gift waits like the cashback of the order that earned it");
  {
    const { store, gifts, coupons, ledgerSum } = memoryStore();
    const g = { orderId: "g1", userId: U, level: 3, amount: 2000, earnedAt: T0 };
    is("recorded at payment", await earnGift(store, { id: "g1", userId: U }, 3, 20), true);
    is("the callback again", await earnGift(store, { id: "g1", userId: U }, 3, 20), false);
    is("no coupon yet", gifts.length, 0);
    is("not delivered", await settleGift(store, g, paid, after(20)), "waiting");
    is("13 days after delivery", await settleGift(store, g, delivered, after(13)), "waiting");
    is("14 days after delivery: the coupon", await settleGift(store, g, delivered, after(14)), "released");
    is("₪20 for level 3", gifts.map((x) => [x.level, x.valueNis, x.active]), [[3, 20, true]]);
    is("once", await settleGift(store, g, delivered, after(15)), "already");
    is("a gift is not cashback: balance and cashback coupons untouched", [await store.balance(U), coupons.length, ledgerSum(U)], [0, 0, 0]);
    is("order still fine", await clawBackGift(store, { ...g, couponCode: gifts[0].code }, delivered), "kept");
    is("refunded later: the unused coupon is switched off", await clawBackGift(store, { ...g, couponCode: gifts[0].code }, refunded), "taken");
    is("off", gifts[0].active, false);
    is("the cron's second look", await clawBackGift(store, { ...g, couponCode: gifts[0].code }, refunded), "already");
    is("still no debt", await store.balance(U), 0);
  }
  {
    const { store, gifts } = memoryStore();
    const g = { orderId: "g2", userId: U, level: 5, amount: 5000, earnedAt: T0 };
    await earnGift(store, { id: "g2", userId: U }, 5, 50);
    is("cancelled before release: void", await settleGift(store, g, refunded, after(3)), "voided");
    is("no coupon", gifts.length, 0);
    is("void is final", await settleGift(store, g, delivered, after(30)), "already");
    is("still no coupon", gifts.length, 0);
  }
  {
    const { store, gifts } = memoryStore();
    const g = { orderId: "g3", userId: U, level: 7, amount: 10000, earnedAt: T0 };
    await earnGift(store, { id: "g3", userId: U }, 7, 100);
    is("never delivered: with the cashback, 45 days after payment", [
      await settleGift(store, g, paid, after(44), 45),
      await settleGift(store, g, paid, after(45), 45),
    ], ["waiting", "released"]);
    gifts[0].busy = true;
    is("refunded while the coupon sits in a checkout: not now", await clawBackGift(store, { ...g, couponCode: gifts[0].code }, refunded), "busy");
    gifts[0].busy = false;
    gifts[0].active = false; // that order was paid: the coupon is spent
    is("spent: recorded, nothing taken", await clawBackGift(store, { ...g, couponCode: gifts[0].code }, refunded), "spent");
    is("and no debt for a gift", await store.balance(U), 0);
    is("once", await clawBackGift(store, { ...g, couponCode: gifts[0].code }, refunded), "already");
  }
  {
    const { store, gifts } = memoryStore();
    // one big order crossing two gift levels
    await earnGift(store, { id: "g4", userId: U }, 3, 20);
    await earnGift(store, { id: "g4", userId: U }, 5, 50);
    for (const [level, amount] of [[3, 2000], [5, 5000]]) {
      await settleGift(store, { orderId: "g4", userId: U, level, amount }, delivered, after(14));
    }
    is("each level its own gift", gifts.map((x) => [x.level, x.valueNis]), [[3, 20], [5, 50]]);
  }

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nall passed");
}

main();
