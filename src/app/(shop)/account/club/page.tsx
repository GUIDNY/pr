import { Check, Coins, Flame, Gift, CalendarDays, Gamepad2, Percent, Trophy } from "lucide-react";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/format";
import { purchaseLevel, CASHBACK_DAYS, GIFT_DAYS } from "@/lib/game-levels";
import { checkinStatus, REWARDS, COUPON_DAYS } from "@/lib/game-wheel";
import { memberCouponHistory } from "@/lib/member-coupons";
import { parseGameProgress } from "@/lib/game-progress";
import { MallAnchor } from "@/components/layout/mall-link";
import { ClubCouponActions } from "@/components/account/club-coupon";

export const metadata = { title: "מועדון הקניון" };

/**
 * The 3D mall's club, on the shop's own personal area: the level the
 * customer's paid orders have reached, what it is worth, the coupons they
 * hold and what became of the earlier ones, and their check-in days. Every
 * number here is counted by the server (game-levels.ts, game-wheel.ts); the
 * only thing read from the game's own save is the coin count, which is
 * cosmetic and shown as such.
 */
const KIND_LABEL: Record<string, string> = {
  cashback: "קאשבק",
  welcome: "מתנת הצטרפות",
  streak7: "7 ימים ברצף",
  days30: "30 ימי כניסה",
};
const kindLabel = (k: string) => KIND_LABEL[k] ?? (k.startsWith("level") ? `מתנת רמה ${k.slice(5)}` : "הטבה");
const STATE = {
  active: { text: "פעיל", cls: "bg-success/15 text-success" },
  used: { text: "נוצל", cls: "bg-muted text-muted-foreground" },
  expired: { text: "פג תוקף", cls: "bg-muted text-muted-foreground" },
} as const;

export default async function ClubPage() {
  const session = await getSession();
  if (!session) return null;

  const [lv, checkin, history, game] = await Promise.all([
    purchaseLevel(session.sub),
    checkinStatus(session.sub),
    memberCouponHistory(session.sub),
    db.gameProfile.findUnique({ where: { userId: session.sub }, select: { progress: true } }),
  ]);
  const coins = parseGameProgress(game?.progress)?.coins ?? 0;
  const tier = lv.tiers[lv.level - 1];
  const next = lv.tiers[lv.level] ?? null;
  const pct = next ? Math.min(100, Math.round(((lv.spent - tier.spend) / (next.spend - tier.spend)) * 100)) : 100;
  const active = history.filter((c) => c.state === "active");
  const past = history.filter((c) => c.state !== "active");
  const streakLeft = 7 - (checkin.streak % 7);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">מועדון הקניון</h1>
          <p className="text-muted-foreground mt-1 text-sm">הרמה, הקאשבק וההטבות שצברתם בקניון התלת־ממדי של BuyToday</p>
        </div>
        <MallAnchor
          medium="account-club"
          className="bg-brand text-brand-foreground hover:bg-brand-hover inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors"
        >
          <Gamepad2 className="size-4" />
          כניסה לקניון
        </MallAnchor>
      </div>

      {/* where they stand */}
      <section className="from-brand to-brand-hover text-brand-foreground relative overflow-hidden rounded-2xl bg-gradient-to-l p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid size-16 shrink-0 place-items-center rounded-2xl bg-white/20 text-center backdrop-blur">
              <div>
                <p className="text-[10px] font-semibold opacity-80">רמה</p>
                <p className="text-2xl leading-none font-extrabold tabular-nums">{lv.level}</p>
              </div>
            </div>
            <div>
              <p className="text-lg font-bold">{tier.cashback ? `${tier.cashback}% קאשבק על כל קנייה` : "עוד לא התחלתם לצבור"}</p>
              <p className="text-sm opacity-85">
                {lv.orders ? `${lv.orders} הזמנות ששולמו · ${formatPrice(lv.spent)} בסך הכול` : "הקנייה הראשונה פותחת 1% קאשבק"}
              </p>
            </div>
          </div>
          <Trophy className="size-10 opacity-30" />
        </div>
        <div className="mt-5">
          <div className="h-2.5 overflow-hidden rounded-full bg-white/25">
            <div className="h-full rounded-full bg-white" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
          <p className="mt-2 text-sm font-medium">
            {next
              ? `עוד ${formatPrice(Math.max(0, next.spend - lv.spent))} לרמה ${next.level}: ${next.cashback}% קאשבק${next.gift ? ` + ₪${next.gift.value} מתנה` : ""}`
              : "הגעתם לרמה הגבוהה ביותר. 5% קאשבק על כל קנייה"}
          </p>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: Gift, value: active.length, label: "הטבות פעילות" },
          { icon: Flame, value: checkin.streak, label: "ימי כניסה ברצף" },
          { icon: CalendarDays, value: checkin.totalDays, label: "ימי כניסה בסך הכול" },
          { icon: Coins, value: coins, label: "מטבעות במשחק" },
        ].map((s) => (
          <div key={s.label} className="border-border rounded-xl border p-4 text-center">
            <s.icon className="text-brand mx-auto mb-2 size-5" />
            <p className="text-xl font-bold tabular-nums">{s.value.toLocaleString("he-IL")}</p>
            <p className="text-muted-foreground text-xs">{s.label}</p>
          </div>
        ))}
      </div>

      {/* coupons they can use now */}
      <section>
        <h2 className="mb-3 font-semibold">ההטבות שלכם</h2>
        {active.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border p-6 text-center text-sm">
            אין כרגע הטבות פעילות. קאשבק מצטבר אחרי כל הזמנה ששולמה, ועל כניסה לקניון יש הטבות התמדה.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.map((c) => (
              <li key={c.code} className="border-brand/30 bg-brand/5 flex flex-col gap-3 rounded-xl border border-dashed p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold">{c.label}</p>
                    <p className="text-muted-foreground text-xs">
                      {kindLabel(c.kind)}
                      {c.rule ? ` · ${c.rule}` : ""}
                    </p>
                  </div>
                  <span dir="ltr" className="bg-background border-border rounded-md border px-2 py-1 font-mono text-xs font-semibold tracking-wider">
                    {c.code}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs">
                  {c.min ? `בקנייה מעל ${formatPrice(c.min)} · ` : ""}
                  {c.endsAt ? `בתוקף עד ${formatDate(c.endsAt)}` : ""}
                </p>
                <ClubCouponActions code={c.code} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* the levels */}
      <section>
        <h2 className="mb-1 font-semibold">הרמות במועדון</h2>
        <p className="text-muted-foreground mb-3 text-xs">הרמה עולה רק מקניות ששולמו. הקאשבק ניתן אחרי כל הזמנה, כקוד אישי לקנייה הבאה.</p>
        <div className="border-border overflow-hidden rounded-xl border">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-muted-foreground text-xs">
              <tr>
                <th className="px-3 py-2 text-start font-medium">רמה</th>
                <th className="px-3 py-2 text-start font-medium">מצטבר קניות</th>
                <th className="px-3 py-2 text-start font-medium">קאשבק</th>
                <th className="px-3 py-2 text-start font-medium">מתנת רמה</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {lv.tiers.map((t) => {
                const here = t.level === lv.level, reached = t.level <= lv.level;
                return (
                  <tr key={t.level} className={here ? "bg-brand/10 font-semibold" : reached ? "" : "text-muted-foreground"}>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center gap-1.5">
                        {reached ? <Check className="text-success size-3.5" /> : <span className="inline-block size-3.5" />}
                        {t.level}
                        {here && <span className="bg-brand text-brand-foreground rounded-full px-2 py-0.5 text-[10px]">אתם כאן</span>}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{t.level === 1 ? "—" : t.spend <= 1 ? "קנייה ראשונה" : formatPrice(t.spend)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{t.cashback ? `${t.cashback}%` : "—"}</td>
                    <td className="px-3 py-2.5">{t.gift ? `₪${t.gift.value} (בקנייה מעל ${formatPrice(t.gift.min)})` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* coming back */}
      <section>
        <h2 className="mb-3 font-semibold">הטבות על התמדה</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {[
            { r: REWARDS.welcome, done: checkin.welcomeGiven, note: checkin.welcomeGiven ? "קיבלתם" : "בכניסה הראשונה לקניון" },
            { r: REWARDS.streak7, done: false, note: `עוד ${streakLeft} ${streakLeft === 1 ? "יום" : "ימים"} ברצף` },
            { r: REWARDS.days30, done: checkin.totalDays >= 30, note: checkin.totalDays >= 30 ? "קיבלתם" : `${checkin.totalDays} מתוך 30 ימים` },
          ].map(({ r, done, note }) => (
            <li key={r.id} className="border-border flex items-center gap-3 rounded-xl border p-4">
              <div className={`grid size-10 shrink-0 place-items-center rounded-full ${done ? "bg-success/15 text-success" : "bg-brand/10 text-brand"}`}>
                {done ? <Check className="size-5" /> : <Percent className="size-5" />}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{r.label}</p>
                <p className="text-muted-foreground text-xs">{r.rule}</p>
                <p className="text-xs font-medium">{note}</p>
              </div>
            </li>
          ))}
        </ul>
        <p className="text-muted-foreground mt-2 text-xs">
          {checkin.checkedInToday ? "נכנסתם היום לקניון ✓" : "עוד לא נכנסתם היום. כניסה לקניון וסיבוב הגלגל נספרים כיום כניסה."}
        </p>
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 font-semibold">היסטוריית הטבות</h2>
          <ul className="divide-border border-border divide-y rounded-xl border">
            {past.map((c) => (
              <li key={c.code} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.label} <span className="text-muted-foreground font-normal">· {kindLabel(c.kind)}</span>
                  </p>
                  <p className="text-muted-foreground text-xs">התקבל ב־{formatDate(c.createdAt)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATE[c.state].cls}`}>{STATE[c.state].text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-muted-foreground text-xs leading-relaxed">
        קאשבק תקף {CASHBACK_DAYS} יום ומתנות רמה {GIFT_DAYS} יום; הטבות התמדה תקפות {COUPON_DAYS} ימים. כל קוד אישי ומיועד להזמנה אחת.
        הזמנה שבוטלה או הוחזרה לא נספרת לרמה. מטבעות המשחק משמשים לקניית בגדים לדמות בלבד ואין להם ערך כספי.
      </p>
    </div>
  );
}
