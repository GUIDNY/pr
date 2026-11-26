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
  CASHBACK_CATEGORY_MULTIPLIER,
  CASHBACK_RELEASE_DAYS,
  MIN_CASHBACK,
  cashbackV2Enabled,
  clawBack,
  decideSettlement,
  earnCashback,
  issueIfDue,
  orderMultiplier,
  planCashback,
  settlePending,
  type CashbackStore,
  type LedgerRow,
  type OrderState,
} from "../src/lib/cashback-v2-rules";

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
  };
  /** The balance must always be what the ledger's balance rows add up to. */
  const ledgerSum = (userId: string) =>
    rows
      .filter((r) => r.userId === userId && r.type !== "EARN" && r.type !== "VOID")
      .reduce((s, r) => s + r.amount, 0);
  return { store, rows, coupons, ledgerSum };
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

  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nall passed");
}

main();
