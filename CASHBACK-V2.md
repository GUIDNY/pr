# Cashback v2 (branch `claude/cashback-v2`)

Status 26.11.2026: written, unit-checked **and run against a real local Postgres**.
**Not merged, not deployed, migration not applied to the shop's database.**
Off by default: with `CASHBACK_V2_ENABLED` unset, cashback and level gifts behave as on `main`.
The one thing a customer sees after a merge with the flag off is the club page headline (row 4 below).

Sources: `COINS-ECONOMY-V2-2026-11-25.md` (agent 01, cashback section + override table),
`ECONOMY-V2-LAW-2026-11-25.md` s.5 (agent 06), `COINS-REVIEW-2026-11-24.md` (agent 20).

## New since the first commit (5681899)

| # | What | Flag off | Flag on |
|---|---|---|---|
| 1 | **The SQL ran.** `npm run check:cashback-db` runs the migration's tables, `awardPurchase`, the Prisma store and the settlement on a throwaway local Postgres 17. 95 checks pass, also with the database time zone set to UTC, Pacific/Auckland and America/Los_Angeles. | – | – |
| 2 | **Level gifts** wait like cashback: recorded at payment, coupon 14 days after delivery, voided if the order is cancelled or returned first. Refunded after release: an unused gift coupon is switched off; a spent one is only recorded (no debt). | at once, as today | pending + void |
| 3 | **Never-delivered orders**: a paid, not cancelled order with no delivery time is released 45 days after payment (`CASHBACK_FALLBACK_RELEASE_DAYS`). | – | on |
| 4 | **Club page**: headline is "X% קאשבק ברכישות לחברי מועדון" with the flag off and "X% קאשבק על כל קנייה" with it on. The cashback block shows agent 06's 14-day sentence and pending level gifts. | **headline changes on merge** | block shown |
| 5 | **`GET /api/game/cashback`** for the mall: balance, pending, pending gifts, level, percent, amount to the next coupon. Signed-in account only. The mall is not changed and does not call it yet. | `enabled: false` | data |
| 6 | **`TERMS-CASHBACK-V2-DRAFT.md`**: Hebrew clauses for the site terms. DRAFT FOR THE LAWYER. | – | – |

## What changes when the flag is on

| | v1 (today, flag off) | v2 (flag on) |
|---|---|---|
| Credit under ₪5 | dropped | kept: added to the member's balance, to the agora |
| When it is usable | at payment, as a coupon | recorded at payment as **pending**; joins the balance 14 days after delivery |
| Never marked delivered | – | joins the balance 45 days after payment, if still paid and not cancelled |
| Coupon | one per order, `floor(total × rate%)` whole shekels | one for the whole shekels of the balance when it reaches ₪5; the agorot stay |
| Cancel / return before release | coupon stays | pending credit is voided |
| Refund after release | nothing | clawed back from the balance (may go negative); unused v2 coupons are taken back to cover it; the cash refund is never touched |
| Level gifts (₪20 / 50 / 100 / 250) | coupon at payment | pending, coupon 14 days after delivery; voided / taken back like cashback, but never a debt |
| Guests | nothing | nothing (unchanged, members only) |
| Rate per level | `TIERS` | unchanged (the table moved to `club-tiers.ts`, same numbers) |
| Per-category multiplier | – | optional table, empty = 1 for everything |
| Coupon owner | not checked at checkout | a club coupon is refused for any account but its owner (v2 coupons are also `membersOnly`) |
| Referral, wheel, streak coupons | – | untouched |

## Files

- `src/lib/cashback-v2-rules.ts` — config constants and the rules, no database. Start here.
- `src/lib/cashback-v2.ts` — the Prisma side: `recordPendingCashback`, `recordPendingGift`, `runCashbackSettlement`, `cashbackSummary`.
- `src/lib/club-tiers.ts` — the level table (rates, gifts), no database. `game-levels.ts` re-exports it.
- `src/lib/game-levels.ts` — `awardPurchase` asks the flag twice (cashback, gifts); the other branch is the old code.
- `src/lib/pricing.ts` — owner check in `resolveCoupon`, only when the flag is on.
- `src/lib/member-coupons.ts` — exports the code generator; hides the "pending" mark rows from coupon lists.
- `src/app/api/internal/cashback-release/route.ts` + `vercel.json` — daily cron (02:40 UTC). Answers `skipped` while the flag is off.
- `src/app/api/game/cashback/route.ts` — the mall's read-only view.
- `src/app/(shop)/account/club/page.tsx` — headline by flag; "pending / balance" block only when the flag is on.
- `prisma/schema.prisma`, `prisma/migrations/20261126000000_cashback_v2/migration.sql` — two new tables, additive only. Unchanged since the first commit.
- `scripts/check-cashback-v2.ts` — `npm run check:cashback` (154 checks, no database).
- `scripts/check-cashback-v2-db.ts` — `npm run check:cashback-db` (95 checks, needs a local throwaway Postgres; refuses any other database).
- `TERMS-CASHBACK-V2-DRAFT.md` — terms clauses for the lawyer.

## How it works

`CashbackLedger` is append-only; `key` is unique and is what makes every step once-only:

| key | type | balance |
|---|---|---|
| `earn:<orderId>` | EARN, at payment | none (pending) |
| `settle:<orderId>` | RELEASE **or** VOID — one key, so an order gets exactly one | + credit / none |
| `clawback:<orderId>` | CLAWBACK | − credit |
| `issue:<code>` | ISSUE (coupon created) | − coupon value |
| `couponvoid:<code>` | COUPON_VOID (unused coupon taken back) | + coupon value |
| `giftearn:<orderId>:<level>` | GIFT_EARN, at payment | none |
| `giftsettle:<orderId>:<level>` | GIFT_RELEASE (coupon created) **or** GIFT_VOID | none |
| `giftclaw:<orderId>:<level>` | GIFT_CLAWBACK (`couponCode` set = the unused coupon was switched off) | none |

`CashbackAccount.balance` (agorot) is the running sum of the balance rows and only moves in the same
transaction as its ledger row. Coupon issue is `UPDATE … WHERE userId = ? AND balance = <the value read>`,
so two concurrent runs cannot issue twice. Invariant to audit:
`balance = sum(amount) over RELEASE, CLAWBACK, ISSUE, COUPON_VOID rows of the user`. Gift rows never count.

Release, void and clawback are **not hooked into the order actions**. The daily cron reads what each
order is today (status, payment status, delivery time), so undo, the admin status menu and manual
payments need no changes and cannot get out of step.

A level gift can be earned again only if the earlier one was voided, or its unused coupon was taken back.
A member who spent the gift and then returned the order does not get it a second time.

## Config (all in `cashback-v2-rules.ts`)

| Name | Value | Meaning |
|---|---|---|
| `CASHBACK_V2_ENABLED` (env) | off | only the exact word `true` switches v2 on |
| `MIN_CASHBACK` | 5 | ₪ balance at which a coupon is issued (and v1's floor) |
| `CASHBACK_RELEASE_DAYS` | 14 | days after delivery until a credit is usable |
| `CASHBACK_FALLBACK_RELEASE_DAYS` (constant, env overrides) | 45 | days after payment for an order with no delivery time; env `0` or `off` disables; an env value under 14 or not a whole number is ignored |
| `CASHBACK_DAYS` | 90 | cashback coupon validity (unchanged) |
| `GIFT_DAYS` (`club-tiers.ts`) | 30 | gift coupon validity (unchanged) |
| `CASHBACK_MIN_CART_FACTOR` | 0 | coupon of ₪X needs a cart of X × factor; 0 = no minimum, as today |
| `CASHBACK_CATEGORY_MULTIPLIER` | `{}` | `{ "<category slug>": 0.5 }`; leaf slug first, then parent; unlisted = 1 |

## What the local database run proved

Setup used: Homebrew PostgreSQL 17.11, a cluster in a temp folder on 127.0.0.1:54329, `prisma db push`
of `origin/main`'s schema (the shop as it is), then `migration.sql` through `psql`.

1. The migration applies cleanly, a second run is harmless (only "already exists" notices), and
   `prisma migrate diff` from that database to `schema.prisma` is empty.
2. All three original raw queries and the three new ones execute and return the right rows.
3. A duplicate ledger key arrives as `P2002` through `@prisma/adapter-pg` and the extended client; the
   batch it was in rolls back (the balance moved once).
4. `update({ where: { userId, balance } })` and `update({ where: { code, isActive: true } })` refuse with
   `P2025` inside `$transaction([...])` and nothing of the batch is left behind.
5. Timestamps: the 14-day and 45-day boundaries hold to within the tested 30 minutes whatever the
   database time zone (Asia/Jerusalem, UTC, Pacific/Auckland, America/Los_Angeles).
6. Three settlement runs at once, two of them separate processes: each order released once, one coupon
   and one gift each. Five issuers racing for one balance: one coupon.

Found and fixed by it: a ledger row with no `orderId` would be picked up by both settlement queries on
every run (no such row is written today; the queries now skip them).

Seen, not changed: every refused duplicate is logged by Prisma as `prisma:error … Unique constraint
failed` before the code catches it. It is expected and harmless, but it will appear in Vercel's logs
whenever two runs race.

**Not proven:** Supabase's pooler (Supavisor, transaction mode) in front of Postgres. Batch
`$transaction([...])` is what the repo already uses elsewhere (`referral.ts`), so I expect no difference,
but it was not run there. Step 5 of the checklist covers it.

## Switching on — checklist for Idan, in this order

1. **Read** this file and `TERMS-CASHBACK-V2-DRAFT.md`. Decide the open questions below that are yours.
2. **Optional, 5 minutes: run the database check yourself.** The commands are at the top of
   `scripts/check-cashback-v2-db.ts`. It needs only a local PostgreSQL and refuses any database that is
   not local and named `cbtest…`.
3. **Merge** the branch. Customers see one change: the club page headline says
   "קאשבק ברכישות לחברי מועדון" instead of "על כל קנייה". The cron starts answering `skipped` once a day.
4. **Apply `migration.sql`** to the shop's database by hand (direct DDL, as
   `scripts/create-game-profile-table.ts` does — `prisma db push` hangs on the pooler). It is idempotent.
5. **Try it on a copy first** if you have one (a Supabase branch or a preview deployment with its own
   database): set `CASHBACK_V2_ENABLED=true` there, place a member order, open
   `/api/internal/cashback-release` as an admin and check it answers `ok: true, errors: 0`.
6. **Terms**: the lawyer approves the clauses in `TERMS-CASHBACK-V2-DRAFT.md` and they go into
   `src/lib/content/terms.ts` (s.9) **before** the next step.
7. **Switch on**: set `CASHBACK_V2_ENABLED=true` in Vercel (Production) and redeploy.
8. **Check**: place one small member order and one above ₪500. `CashbackLedger` has one `earn:` row
   each (and a `giftearn:` row for the second if it crossed level 3); `/account/club` shows them as
   pending; `/api/game/cashback` answers `enabled: true` for that account.
9. **The next morning**: open the cron's last answer in Vercel's logs: `errors: 0`.
10. **After 14 days**: the first delivered order's credit is in the balance.

## Rollback

Set `CASHBACK_V2_ENABLED` to anything but `true` (or remove it) and redeploy. Nothing else.

- New orders go back to v1: a coupon at payment, gifts at once.
- Orders already credited by v2 are marked (`MemberCoupon.kind = "cashback-pending"` on `orderId`), so
  v1 does not pay them a second time.
- Pending credits, pending gifts and balances stay in the tables, but nothing settles them while the
  flag is off. Switching it on again picks them up where they were.
- Coupons v2 already issued keep working. The owner check at checkout goes back off.
- The tables can stay. Do not drop them while balances exist.

## What Idan must check

1. **Delivery time.** "Delivered" = `Order.deliveredAt`, written only by `closeOrderAction` ("סגור הזמנה"). `updateOrderStatusAction` can set `DELIVERED` without it, so the settlement falls back to the time of the last `DELIVERED` row in `OrderStatusHistory`. Is closing an order a fair stand-in for the day the customer received it? An order that is never closed is now released 45 days after payment instead of never.
2. **Is 45 days right?** It must be longer than the slowest real delivery plus 14 days, or a customer could get the credit while still able to return the goods.
3. **Partial returns.** A credit is voided or clawed back only when the whole order is CANCELLED / REFUND_PENDING / REFUNDED. If one item of three is returned and the order stays as it is, the full credit stays.
4. **Cron slot.** `vercel.json` has 14 entries with this one; confirm the plan allows it.
5. **Owner check** in `resolveCoupon` applies, when the flag is on, to every `MemberCoupon` code except `ref-link` (wheel, streak, level gifts too). Intended (agent 20, M4), but it is a behaviour change for those coupons.
6. **Rounding.** v2 credits `total × rate` to the agora on `Order.total` (after discount, including the delivery fee — the same base v1 uses). v1 floors to whole shekels per order, so v2 is slightly more generous.
7. The category multiplier is applied as one weighted figure to the whole order total, delivery fee included.
8. **Rate limit** on `/api/game/cashback` is the repo's in-memory counter (30 a minute per account, per instance), the same kind `/api/game/report` uses. `/api/game/profile` and `/api/game/spin` have none.
9. **Club page, flag off**: two smaller sentences still say cashback comes after every order ("הקאשבק ניתן אחרי כל הזמנה…", "קאשבק מצטבר אחרי כל הזמנה ששולמה…"). Only the headline was asked for; say if these should change too.
10. **A switch-on with v1 gifts already held**: a member who got a level gift under v1 is not given that level's gift again by v2 (checked on the local database).

## Open questions

- Asaf: `CASHBACK_MIN_CART_FACTOR` (design example: 4) and confirmation of 14 days / ₪5 / 45 days.
- Idan: multiplier per category from real margins; which slugs.
- A v2 coupon that expires unused after 90 days is lost, as in v1. Return it to the balance instead? (Also a question for the lawyer, in the terms draft.)
- A voided credit or gift is final: an order cancelled and then revived does not get it back automatically.
- Negative balances are never collected in money; they only wait for the next cashback. Cap or alert?
- A level gift that was spent before its order was refunded costs the shop the gift. Accept, or record a debt as cashback does?
- The mall (`game.html`) does not call `/api/game/cashback` yet.
- For the lawyer: the eleven questions at the end of `TERMS-CASHBACK-V2-DRAFT.md`.
