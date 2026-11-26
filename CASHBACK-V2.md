# Cashback v2 (branch `claude/cashback-v2`)

Status: written and unit-checked, **not merged, not deployed, migration not applied**.
Off by default: with `CASHBACK_V2_ENABLED` unset, cashback behaves exactly as on `main`.

Sources: `COINS-ECONOMY-V2-2026-11-25.md` (agent 01, cashback section + override table),
`ECONOMY-V2-LAW-2026-11-25.md` s.5 (agent 06), `COINS-REVIEW-2026-11-24.md` (agent 20).

## What changes when the flag is on

| | v1 (today, flag off) | v2 (flag on) |
|---|---|---|
| Credit under ₪5 | dropped | kept: added to the member's balance, to the agora |
| When it is usable | at payment, as a coupon | recorded at payment as **pending**; joins the balance 14 days after delivery |
| Coupon | one per order, `floor(total × rate%)` whole shekels | one for the whole shekels of the balance when it reaches ₪5; the agorot stay |
| Cancel / return before release | coupon stays | pending credit is voided |
| Refund after release | nothing | clawed back from the balance (may go negative); unused v2 coupons are taken back to cover it; the cash refund is never touched |
| Guests | nothing | nothing (unchanged, members only) |
| Rate per level | `TIERS` in `game-levels.ts` | unchanged |
| Per-category multiplier | – | optional table, empty = 1 for everything |
| Coupon owner | not checked at checkout | a club coupon is refused for any account but its owner (v2 coupons are also `membersOnly`) |
| Level gifts, referral, wheel coupons | – | untouched |

## Files

- `src/lib/cashback-v2-rules.ts` — config constants and the rules, no database. Start here.
- `src/lib/cashback-v2.ts` — the Prisma side: `recordPendingCashback`, `runCashbackSettlement`, `cashbackSummary`.
- `src/lib/game-levels.ts` — `awardPurchase` asks the flag; the v1 branch is the old code.
- `src/lib/pricing.ts` — owner check in `resolveCoupon`, only when the flag is on.
- `src/lib/member-coupons.ts` — exports the code generator; hides the "pending" mark rows from coupon lists.
- `src/app/api/internal/cashback-release/route.ts` + `vercel.json` — daily cron (02:40 UTC). Answers `skipped` while the flag is off.
- `src/app/(shop)/account/club/page.tsx` — a "pending / balance" block, rendered only when the flag is on.
- `prisma/schema.prisma`, `prisma/migrations/20261126000000_cashback_v2/migration.sql` — two new tables, additive only.
- `scripts/check-cashback-v2.ts` — `npm run check:cashback` (73 checks, no database).

## How it works

`CashbackLedger` is append-only; `key` is unique and is what makes every step once-only:

| key | type | balance |
|---|---|---|
| `earn:<orderId>` | EARN, at payment | none (pending) |
| `settle:<orderId>` | RELEASE **or** VOID — one key, so an order gets exactly one | + credit / none |
| `clawback:<orderId>` | CLAWBACK | − credit |
| `issue:<code>` | ISSUE (coupon created) | − coupon value |
| `couponvoid:<code>` | COUPON_VOID (unused coupon taken back) | + coupon value |

`CashbackAccount.balance` (agorot) is the running sum of the balance rows and only moves in the same
transaction as its ledger row. Coupon issue is `UPDATE … WHERE userId = ? AND balance = <the value read>`,
so two concurrent runs cannot issue twice. Invariant to audit:
`balance = sum(amount) over RELEASE, CLAWBACK, ISSUE, COUPON_VOID rows of the user`.

Release, void and clawback are **not hooked into the order actions**. The daily cron reads what each
order is today (status, payment status, delivery time), so undo, the admin status menu and manual
payments need no changes and cannot get out of step.

## Config (all in `cashback-v2-rules.ts`)

| Constant | Value | Meaning |
|---|---|---|
| `CASHBACK_V2_ENABLED` (env) | off | only the exact word `true` switches v2 on |
| `MIN_CASHBACK` | 5 | ₪ balance at which a coupon is issued (and v1's floor) |
| `CASHBACK_RELEASE_DAYS` | 14 | days after delivery until a credit is usable |
| `CASHBACK_DAYS` | 90 | coupon validity (unchanged) |
| `CASHBACK_MIN_CART_FACTOR` | 0 | coupon of ₪X needs a cart of X × factor; 0 = no minimum, as today |
| `CASHBACK_CATEGORY_MULTIPLIER` | `{}` | `{ "<category slug>": 0.5 }`; leaf slug first, then parent; unlisted = 1 |

## Switching on (in this order)

1. Review and merge. Merging alone changes nothing a customer sees; it adds one cron call a day that answers `skipped`.
2. Apply `migration.sql` to the database by hand (direct DDL, as `scripts/create-game-profile-table.ts` does — `prisma db push` hangs on the pooler). It is idempotent.
3. Update the site terms with agent 06's sentence (credit conditional on the order not being cancelled, usable 14 days after delivery) **before** step 4.
4. Set `CASHBACK_V2_ENABLED=true` in Vercel (Production) and redeploy.
5. Place one small member order and one above ₪500; check `CashbackLedger` has one `earn:` row each and `/account/club` shows them as pending.

Switching off again: set the variable to anything else and redeploy. New orders go back to v1 coupons.
Orders already credited by v2 are marked (`MemberCoupon.kind = "cashback-pending"` on `orderId`), so v1
does not pay them a second time. Pending credits and balances stay in the tables but nothing settles
them while the flag is off.

## What Idan must check

1. **Delivery time.** "Delivered" = `Order.deliveredAt`, written only by `closeOrderAction` ("סגור הזמנה"). `updateOrderStatusAction` can set `DELIVERED` without it, so the settlement falls back to the time of the last `DELIVERED` row in `OrderStatusHistory`. Is closing an order a fair stand-in for the day the customer received it? An order that is never closed keeps its credit pending forever.
2. **The SQL.** Two raw queries in `runCashbackSettlement` and one in `cashbackSummary` were type-checked but **never run against Postgres**. Run the cron route once on a database copy.
3. **Prisma behaviour assumed, not exercised:** `update({ where: { userId, balance } })` / `update({ where: { code, isActive: true } })` throwing P2025 inside `$transaction([...])` and rolling the batch back; unique violation surfacing as P2002 through `@prisma/adapter-pg`.
4. **Cron slot.** `vercel.json` gets a 14th entry; confirm the plan allows it.
5. **Owner check** in `resolveCoupon` applies, when the flag is on, to every `MemberCoupon` code except `ref-link` (wheel, streak, level gifts too). Intended (agent 20, M4), but it is a behaviour change for those coupons.
6. **Rounding.** v2 credits `total × rate` to the agora on `Order.total` (after discount, including the delivery fee — the same base v1 uses). v1 floors to whole shekels per order, so v2 is slightly more generous.
7. The category multiplier is applied as one weighted figure to the whole order total, delivery fee included.

## Open questions

- Asaf: `CASHBACK_MIN_CART_FACTOR` (design example: 4) and confirmation of 14 days / ₪5.
- Idan: multiplier per category from real margins; which slugs.
- Level gifts are still issued at payment with no pending period and no clawback (agent 20, S4). Not in this change.
- A v2 coupon that expires unused after 90 days is lost, as in v1. Return it to the balance instead?
- Should a pending credit be released after N days without a delivery mark (never-closed orders)?
- A voided credit is final: an order cancelled and then revived does not get it back automatically.
- Negative balances are never collected in money; they only wait for the next cashback. Cap or alert?
- The mall (`game.html`) does not read pending/balance yet; only `/account/club` shows it.
- Club page headline still says "% קאשבק על כל קנייה"; agent 06's approved wording is "זיכוי של 1% עד 5% לחברי המועדון, לקנייה הבאה".
