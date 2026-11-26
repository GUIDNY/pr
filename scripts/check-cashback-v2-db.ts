/**
 * Cashback v2 against a REAL Postgres — the half scripts/check-cashback-v2.ts
 * cannot do. That one walks the rules over an in-memory ledger; this one runs
 * the Prisma store, the three raw queries and awardPurchase itself, so the
 * things that were only assumed are exercised: a unique violation arriving as
 * P2002 through @prisma/adapter-pg, a conditional update refusing with P2025
 * and rolling its whole batch back, timestamps surviving the round trip
 * whatever the server's time zone, and two settlement runs at once.
 *
 * It WRITES: users, orders, coupons. So it refuses to start unless
 * DATABASE_URL points at a database on this machine whose name starts with
 * "cbtest" — it cannot be aimed at the shop's database by accident.
 *
 * A throwaway database (PostgreSQL from Homebrew, nothing else needed):
 *
 *   export LC_ALL=C
 *   initdb -D /tmp/cb/data -U cbtest --auth=trust -E UTF8 --locale=C
 *   pg_ctl -D /tmp/cb/data -o "-p 54329 -c listen_addresses=127.0.0.1" -l /tmp/cb/log -w start
 *   createdb -h 127.0.0.1 -p 54329 -U cbtest cbtest
 *   export DATABASE_URL=postgresql://cbtest@127.0.0.1:54329/cbtest
 *   git show origin/main:prisma/schema.prisma > /tmp/cb/base.prisma
 *   npx prisma db push --schema /tmp/cb/base.prisma          # the shop as it is today
 *   psql "$DATABASE_URL" -f prisma/migrations/20261126000000_cashback_v2/migration.sql
 *   npm run check:cashback-db
 *   pg_ctl -D /tmp/cb/data stop
 *
 * Time is never faked inside the database: every settlement run is simply
 * told what "now" is, which is the argument the cron route leaves at its
 * default.
 */
import { spawn } from "child_process";
import { fileURLToPath } from "url";

function localTestDatabase(): boolean {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.slice(1).startsWith("cbtest");
  } catch {
    return false;
  }
}
if (!localTestDatabase()) {
  console.error('refusing to run: DATABASE_URL must be a local database named "cbtest…" (see the top of this file)');
  process.exit(2);
}
process.env.CASHBACK_V2_ENABLED = "true";

const day = 86_400_000;
const minute = 60_000;

let failed = 0;
let count = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  count++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

/** A second process running the settlement, for the two-at-once check. */
function settleInChild(now: Date): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [...process.execArgv, fileURLToPath(import.meta.url), "--settle", now.toISOString()],
      { env: process.env, stdio: ["ignore", "ignore", "inherit"] },
    );
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

async function main() {
  // only now: importing these opens the database named above
  const { db } = await import("../src/lib/db");
  const { awardPurchase } = await import("../src/lib/game-levels");
  const { cashbackStore, cashbackSummary, runCashbackSettlement } = await import("../src/lib/cashback-v2");

  const childAt = process.argv.indexOf("--settle");
  if (childAt > 0) {
    const r = await runCashbackSettlement(new Date(process.argv[childAt + 1]));
    process.exit(r.errors ? 1 : 0);
  }

  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
  let seq = 0;
  const T0 = new Date();
  const at = (days: number, minutes = 0) => new Date(T0.getTime() + days * day + minutes * minute);

  const newUser = async () => {
    const n = ++seq;
    const u = await db.user.create({
      data: { email: `cbv2-${run}-${n}@test.invalid`, passwordHash: "x", name: `Test ${n}` },
      select: { id: true },
    });
    return u.id;
  };
  /** A paid order, and the same call the payment callback makes. */
  const paidOrder = async (userId: string | null, total: number) => {
    const o = await db.order.create({
      data: {
        orderNumber: `CB-${run}-${++seq}`,
        userId,
        guestEmail: userId ? null : "guest@test.invalid",
        subtotal: total,
        total,
        status: "PAID",
        paymentStatus: "CAPTURED",
      },
      select: { id: true },
    });
    await awardPurchase(o.id);
    return o.id;
  };
  const deliver = (id: string, when: Date = T0) =>
    db.order.update({ where: { id }, data: { status: "DELIVERED", deliveredAt: when } });
  const refund = (id: string) =>
    db.order.update({ where: { id }, data: { status: "REFUNDED", paymentStatus: "REFUNDED" } });
  const ledger = (userId: string, type?: string) =>
    db.cashbackLedger.findMany({ where: { userId, ...(type ? { type } : {}) }, orderBy: { createdAt: "asc" } });
  const rowsOf = async (userId: string, type: string) => (await ledger(userId, type)).map((r) => r.amount);
  /** The invariant CASHBACK-V2.md states: the balance is the sum of its rows. */
  const balanceRows = ["RELEASE", "CLAWBACK", "ISSUE", "COUPON_VOID"];
  const squares = async (userId: string) => {
    const sum = (await ledger(userId)).filter((r) => balanceRows.includes(r.type)).reduce((s, r) => s + r.amount, 0);
    return sum === (await cashbackStore.balance(userId));
  };
  /** The account's cashback coupons as the checkout would find them. */
  const coupons = async (userId: string) => {
    const mine = await db.memberCoupon.findMany({ where: { userId, kind: "cashback" }, select: { code: true } });
    const promos = await db.promotion.findMany({
      where: { code: { in: mine.map((m) => m.code) } },
      orderBy: { createdAt: "asc" },
    });
    return promos;
  };
  const settle = (now: Date) => runCashbackSettlement(now);

  console.log("\nThe tables are the ones the schema describes");
  {
    const cols = await db.$queryRaw<{ t: string; c: string }[]>`
      SELECT table_name AS t, column_name AS c FROM information_schema.columns
      WHERE table_name IN ('CashbackAccount', 'CashbackLedger') ORDER BY 1, ordinal_position`;
    is(
      "columns",
      cols.map((x) => `${x.t}.${x.c}`).join(" "),
      "CashbackAccount.userId CashbackAccount.balance CashbackAccount.updatedAt CashbackLedger.id CashbackLedger.key CashbackLedger.userId CashbackLedger.type CashbackLedger.amount CashbackLedger.orderId CashbackLedger.couponCode CashbackLedger.note CashbackLedger.createdAt",
    );
  }

  console.log("\nA key is written once (P2002 through the adapter)");
  {
    const u = await newUser();
    const row = { key: `test:${run}:a`, userId: u, type: "RELEASE" as const, amount: 120 };
    is("first write", await cashbackStore.append(row, 120), true);
    is("second write is refused, not thrown", await cashbackStore.append(row, 120), false);
    is("the balance moved once: the refused batch rolled back", await cashbackStore.balance(u), 120);
    is("a pending row with the same trick", [
      await cashbackStore.append({ key: `test:${run}:b`, userId: u, type: "EARN", amount: 5 }, 0),
      await cashbackStore.append({ key: `test:${run}:b`, userId: u, type: "EARN", amount: 5 }, 0),
    ], [true, false]);
  }

  console.log("\nA coupon only against the balance it was worked out from (P2025 rolls the batch back)");
  {
    const u = await newUser();
    await cashbackStore.append({ key: `test:${run}:c`, userId: u, type: "RELEASE", amount: 700 }, 700);
    const stale = await cashbackStore.issueCoupon({ userId: u, expectedBalance: 650, agorot: 600, valueNis: 6, minCart: 0, days: 90 });
    is("a stale balance is refused", stale, null);
    is("and left nothing behind", [(await coupons(u)).length, (await ledger(u, "ISSUE")).length, await cashbackStore.balance(u)], [0, 0, 700]);
    const code = await cashbackStore.issueCoupon({ userId: u, expectedBalance: 700, agorot: 700, valueNis: 7, minCart: 0, days: 90 });
    const [promo] = await coupons(u);
    is("the right balance issues", [typeof code, promo?.code === code, promo?.type, promo?.value, promo?.membersOnly, promo?.isActive], ["string", true, "FIXED", 7, true, true]);
    is("good for 90 days", Math.round((promo.endsAt!.getTime() - promo.startsAt!.getTime()) / day), 90);
    is("balance and ledger", [await cashbackStore.balance(u), await squares(u)], [0, true]);
    is("no account row: refused, not thrown", await cashbackStore.issueCoupon({ userId: await newUser(), expectedBalance: 0, agorot: 500, valueNis: 5, minCart: 0, days: 90 }), null);
  }

  console.log("\nSmall orders add up (awardPurchase → cron)");
  const A = await newUser();
  {
    const o1 = await paidOrder(A, 80);
    is("₪80 at level 2 is 80 agorot, pending", await rowsOf(A, "EARN"), [80]);
    is("not in the balance", await cashbackSummary(A), { balance: 0, pending: 80 });
    await awardPurchase(o1);
    await awardPurchase(o1);
    is("the payment callback again changes nothing", await rowsOf(A, "EARN"), [80]);
    is("v1 did not also pay it", (await coupons(A)).length, 0);
    is("not delivered: the cron leaves it", (await settle(at(30))).released, 0);
    await deliver(o1);
    is("13 days and 23½ hours after delivery", (await settle(at(14, -30))).released, 0);
    is("14 days after delivery", (await settle(at(14, 1))).released, 1);
    is("80 agorot kept, no coupon under ₪5", [await cashbackSummary(A), (await coupons(A)).length], [{ balance: 80, pending: 0 }, 0]);
    is("the cron again", (await settle(at(15))).released, 0);

    const o2 = await paidOrder(A, 300);
    const o3 = await paidOrder(A, 100);
    await deliver(o2);
    await deliver(o3);
    is("two more released", (await settle(at(14, 1))).released, 2);
    is("₪4.80 and still no coupon", [await cashbackStore.balance(A), (await coupons(A)).length], [480, 0]);

    const o4 = await paidOrder(A, 200); // ₪680 so far: level 3, 1.5%
    is("the level's own rate", (await rowsOf(A, "EARN")).at(-1), 300);
    await deliver(o4);
    const r = await settle(at(14, 1));
    is("released, and the balance crossed ₪5", [r.released, r.errors], [1, 0]);
    const mine = await coupons(A);
    is("one coupon for the whole shekels", mine.map((p) => p.value), [7]);
    is("the agorot stay", await cashbackSummary(A), { balance: 80, pending: 0 });
    is("balance equals the ledger", await squares(A), true);
    is("the cron a third time", await settle(at(40)).then((x) => [x.released, x.issued, x.voided, x.clawed]), [0, 0, 0, 0]);
    is("still one coupon", (await coupons(A)).length, 1);
  }

  console.log("\nGuests earn nothing");
  {
    const before = await db.cashbackLedger.count();
    await paidOrder(null, 900);
    is("no ledger row", (await db.cashbackLedger.count()) - before, 0);
  }

  console.log("\nCancelled before release: void");
  {
    const u = await newUser();
    const o = await paidOrder(u, 1000);
    is("₪1,000 at level 4 is ₪20 pending", await cashbackSummary(u), { balance: 0, pending: 2000 });
    await db.order.update({ where: { id: o }, data: { status: "CANCELLED" } });
    is("voided", (await settle(at(1))).voided, 1);
    is("nothing pending, nothing usable", await cashbackSummary(u), { balance: 0, pending: 0 });
    await deliver(o);
    is("revived and delivered: a void is final", await settle(at(30)).then((x) => [x.released, x.voided]), [0, 0]);
    is("still nothing", [await cashbackStore.balance(u), (await coupons(u)).length], [0, 0]);
  }
  {
    const u = await newUser();
    const o = await paidOrder(u, 400);
    await deliver(o);
    await refund(o);
    is("returned within the 14 days: void", (await settle(at(20))).voided, 1);
    const gone = await paidOrder(u, 400);
    await db.order.delete({ where: { id: gone } });
    is("the order row deleted: void", (await settle(at(20))).voided, 1);
    is("nothing reached the balance", await cashbackSummary(u), { balance: 0, pending: 0 });
  }

  console.log("\nDelivered from the status menu (no deliveredAt): the history row's time");
  {
    const u = await newUser();
    const o = await paidOrder(u, 250);
    await db.order.update({ where: { id: o }, data: { status: "DELIVERED" } });
    await db.orderStatusHistory.create({ data: { orderId: o, fromStatus: "SHIPPED", toStatus: "DELIVERED", createdAt: at(2) } });
    is("14 days after delivery day 0 is too early", (await settle(at(14, 1))).released, 0);
    is("14 days after the history row", (await settle(at(16, 1))).released, 1);
    is("credited", await cashbackStore.balance(u), 250);
  }

  console.log("\nRefunded after release: clawed back from the balance");
  {
    const u = await newUser();
    const o = await paidOrder(u, 1000);
    await deliver(o);
    await settle(at(14, 1));
    const [c] = await coupons(u);
    is("₪20 coupon issued", [c?.value, c?.isActive, await cashbackStore.balance(u)], [20, true, 0]);
    is("order still fine: the cron claws nothing", (await settle(at(15))).clawed, 0);
    await refund(o);
    is("refunded: clawed", (await settle(at(20))).clawed, 1);
    is("the unused coupon was switched off", (await coupons(u))[0].isActive, false);
    is("and the account is square", [await cashbackStore.balance(u), await squares(u)], [0, true]);
    is("ledger rows", (await ledger(u)).map((r) => `${r.type}:${r.amount}`).filter((x) => !x.startsWith("GIFT")), ["EARN:2000", "RELEASE:2000", "ISSUE:-2000", "CLAWBACK:-2000", "COUPON_VOID:2000"]);
    is("the cron again", (await settle(at(21))).clawed, 0);
  }
  {
    const u = await newUser();
    const o = await paidOrder(u, 1000);
    await deliver(o);
    await settle(at(14, 1));
    const [c] = await coupons(u);
    await db.promotion.update({ where: { code: c.code! }, data: { isActive: false } }); // spent: retireGameCoupon
    await refund(o);
    is("clawed", (await settle(at(20))).clawed, 1);
    is("a spent credit leaves a debt", await cashbackStore.balance(u), -2000);
    const next = await paidOrder(u, 3000); // the refunded order no longer counts: level 5, 2.5%
    await deliver(next);
    await settle(at(14, 1));
    is("the next cashback pays the debt first", (await coupons(u)).map((p) => [p.value, p.isActive]), [[20, false], [55, true]]);
    is("square", [await cashbackStore.balance(u), await squares(u)], [0, true]);
  }
  {
    const u = await newUser();
    const o = await paidOrder(u, 1000);
    await deliver(o);
    await settle(at(14, 1));
    const [c] = await coupons(u);
    // the coupon is sitting on an order that is on its way to being paid
    await db.order.create({ data: { orderNumber: `CB-${run}-${++seq}`, userId: u, subtotal: 500, total: 480, couponCode: c.code, status: "PAYMENT_PENDING" } });
    await refund(o);
    is("clawed", (await settle(at(20))).clawed, 1);
    is("a coupon in a checkout is not pulled from under it", [(await coupons(u))[0].isActive, await cashbackStore.balance(u)], [true, -2000]);
  }

  console.log("\nTwo settlement runs at once");
  {
    const users: string[] = [];
    for (let i = 0; i < 6; i++) {
      const u = await newUser();
      users.push(u);
      await deliver(await paidOrder(u, 1000));
    }
    const now = at(14, 1);
    const codes = await Promise.all([settleInChild(now), settleInChild(now), settle(now).then((r) => r.errors)]);
    is("three runs, two of them other processes, no errors", codes, [0, 0, 0]);
    const state = [];
    for (const u of users) {
      state.push([await rowsOf(u, "RELEASE"), (await coupons(u)).map((p) => p.value), await cashbackStore.balance(u), await squares(u)]);
    }
    is("each order released once, one coupon each", state, users.map(() => [[2000], [20], 0, true]));
  }
  {
    // the narrow one: many issuers racing for one balance
    const u = await newUser();
    await cashbackStore.append({ key: `test:${run}:race`, userId: u, type: "RELEASE", amount: 1234 }, 1234);
    const { issueIfDue } = await import("../src/lib/cashback-v2-rules");
    const got = await Promise.all(Array.from({ length: 5 }, () => issueIfDue(cashbackStore, u)));
    is("five issuers, one coupon", [got.filter(Boolean).length, (await coupons(u)).map((p) => p.value), await cashbackStore.balance(u)], [1, [12], 34]);
  }

  console.log(failed ? `\n${failed} of ${count} failed` : `\nall ${count} passed`);
  await db.$disconnect();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
