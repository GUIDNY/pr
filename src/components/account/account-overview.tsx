import Link from "next/link";
import { Package, Heart, MapPin, ArrowLeft, Trophy, Gamepad2, Gift, Ticket, ShoppingBag, BellRing } from "lucide-react";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/enums";
import { formatPrice, formatDate } from "@/lib/format";
import { ConsentToggle } from "@/components/account/consent-toggle";
import { ReferralCard } from "@/components/referral/referral-card";
import { REFERRAL_FRIEND_PERCENT } from "@/lib/referral-rules";
import { MallAnchor } from "@/components/layout/mall-link";

/**
 * The personal area's front page, drawn from data the page loads — kept apart
 * from the loading so it can be looked at with sample data.
 */
export function AccountOverview({
  firstName,
  since: sinceDate,
  counts,
  owedFriend,
  coupons,
  referral,
  club,
  recentOrders,
  consent,
}: {
  firstName: string;
  since: Date | null;
  counts: { orders: number; favorites: number; addresses: number };
  owedFriend: { fromName: string | null } | null;
  coupons: { code: string; label: string; min: number; endsAt: string }[];
  referral: { link: string; friends: number; nextReward: number };
  club: { level: number; cashback: number; toNext: { spend: number; level: number } | null } | null;
  recentOrders: { id: string; orderNumber: string; createdAt: Date; status: string; total: number }[];
  consent: { whatsapp: boolean; marketing: boolean; phone: string | null };
}) {
  const since = sinceDate ? new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric" }).format(sinceDate) : null;
  const stats = [
    { href: "/account/orders", icon: Package, value: counts.orders, label: "הזמנות" },
    { href: "/account/favorites", icon: Heart, value: counts.favorites, label: "מועדפים" },
    { href: "/account/addresses", icon: MapPin, value: counts.addresses, label: "כתובות" },
  ];
  return (
    <div className="flex flex-col gap-5">
      {/* ── welcome ─────────────────────────────────────────────── */}
      <section className="bg-card relative overflow-hidden rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
        <div aria-hidden className="bg-brand/10 pointer-events-none absolute -top-16 -start-16 size-48 rounded-full blur-2xl" />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-muted-foreground text-sm">האזור האישי</p>
            <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">שלום, {firstName} 👋</h1>
            {since && <p className="text-muted-foreground mt-1 text-sm">לקוח/ה של Buy Today מאז {since}</p>}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {stats.map((st) => (
              <Link
                key={st.href}
                href={st.href}
                className="hover:border-brand/40 group bg-background flex min-w-[88px] flex-col items-center rounded-xl border px-3 py-2.5 text-center transition-colors"
              >
                <st.icon className="text-brand mb-1 size-5" />
                <span className="text-xl font-black tabular-nums leading-none">{st.value}</span>
                <span className="text-muted-foreground mt-1 text-xs">{st.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── a friend's discount waiting on this account ─────────────── */}
      {owedFriend && (
        <section className="from-brand to-brand-hover text-brand-foreground relative overflow-hidden rounded-2xl bg-gradient-to-l p-5 shadow-md sm:p-6">
          <Gift aria-hidden className="pointer-events-none absolute -bottom-6 -start-4 size-32 rotate-12 opacity-15" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-white/20">
                <Gift className="size-6" />
              </span>
              <div>
                <p className="text-sm font-semibold opacity-90">מתנה מחבר</p>
                <h2 className="text-xl font-black sm:text-2xl">
                  {owedFriend.fromName ? `${owedFriend.fromName} הביא/ה לך` : "חבר הביא לך"} {REFERRAL_FRIEND_PERCENT}% הנחה
                </h2>
                <p className="mt-1 text-sm opacity-90">
                  שמורה בחשבון שלך ותופעל אוטומטית בעגלה בהזמנה הראשונה — מכל מכשיר.
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="text-brand inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-white px-5 text-sm font-black shadow-sm hover:bg-white/90"
            >
              לקנייה עם ההנחה <ArrowLeft className="size-4" />
            </Link>
          </div>
        </section>
      )}

      {/* ── my benefits: every coupon this account holds ───────────── */}
      {coupons.length > 0 && (
        <section className="bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Ticket className="text-brand size-5" /> ההטבות שלי
            </h2>
            <span className="bg-brand/10 text-brand rounded-full px-2.5 py-0.5 text-xs font-bold">{coupons.length}</span>
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {coupons.map((c) => (
              <li key={c.code} className="border-brand/30 bg-brand/5 relative flex items-center gap-3 overflow-hidden rounded-xl border border-dashed p-3.5">
                <div className="bg-brand text-brand-foreground grid size-12 shrink-0 place-items-center rounded-lg text-sm font-black">
                  {c.label.replace(" הנחה", "").replace(" קאשבק", "")}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{c.label}</p>
                  <p className="text-muted-foreground text-xs">
                    {c.min > 0 ? `בקנייה מעל ${formatPrice(c.min)} · ` : ""}בתוקף עד {formatDate(new Date(c.endsAt))}
                  </p>
                  <p dir="ltr" className="mt-1 text-end font-mono text-xs font-semibold tracking-wider">
                    {c.code}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground mt-3 text-xs">מקלידים את הקוד בעגלה, בשדה &quot;קוד קופון&quot;.</p>
        </section>
      )}

      {/* ── חבר מביא חבר ─────────────────────────────────────────── */}
      <ReferralCard link={referral.link} friends={referral.friends} nextReward={referral.nextReward} />

      {club && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MallAnchor
            medium="account-home"
            className="from-brand to-brand-hover text-brand-foreground flex items-center gap-4 rounded-2xl bg-gradient-to-l p-4 shadow-sm transition-opacity hover:opacity-95"
          >
            <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/20">
              <Gamepad2 className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">כניסה לקניון התלת־ממדי</p>
              <p className="text-xs opacity-90">המשחק פתוח כרגע לצוות ההנהלה בלבד</p>
            </div>
            <ArrowLeft className="size-4 shrink-0" />
          </MallAnchor>
          <Link
            href="/account/club"
            className="bg-card hover:border-brand/50 flex items-center gap-4 rounded-2xl border p-4 transition-colors"
          >
            <div className="bg-brand/10 text-brand grid size-12 shrink-0 place-items-center rounded-xl">
              <Trophy className="size-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">
                מועדון הקניון · רמה {club.level}
                {club.cashback ? ` · ${club.cashback}% קאשבק` : ""}
              </p>
              <p className="text-muted-foreground text-xs">
                {club.toNext ? `עוד ${formatPrice(club.toNext.spend)} לרמה ${club.toNext.level}` : "הרמה הגבוהה ביותר"}
              </p>
            </div>
            <ArrowLeft className="text-brand size-4 shrink-0" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5">
        {/* ── recent orders ────────────────────────────────────────── */}
        <section className="bg-card rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-lg font-bold">
              <Package className="text-brand size-5" /> הזמנות אחרונות
            </h2>
            <Link href="/account/orders" className="text-brand flex items-center gap-1 text-sm font-semibold hover:underline">
              כל ההזמנות <ArrowLeft className="size-3.5" />
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed px-4 py-10 text-center">
              <ShoppingBag className="text-muted-foreground size-9" />
              <p className="font-semibold">עדיין לא ביצעתם הזמנות</p>
              <Link href="/" className="bg-brand text-brand-foreground hover:bg-brand-hover inline-flex h-10 items-center rounded-xl px-4 text-sm font-bold">
                להתחיל לקנות
              </Link>
            </div>
          ) : (
            <ul className="divide-border divide-y">
              {recentOrders.map((order) => (
                <li key={order.id}>
                  <Link href={`/account/orders/${order.orderNumber}`} className="hover:bg-muted/60 -mx-2 flex items-center justify-between gap-3 rounded-lg px-2 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="bg-muted grid size-10 shrink-0 place-items-center rounded-lg">
                        <Package className="text-muted-foreground size-5" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold">{order.orderNumber}</p>
                        <p className="text-muted-foreground text-xs">{formatDate(order.createdAt)}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${ORDER_STATUS_COLORS[order.status as OrderStatus]}`}>
                        {ORDER_STATUS_LABELS[order.status as OrderStatus]}
                      </span>
                      <span className="font-bold tabular-nums">{formatPrice(order.total)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── communication preferences ──────────────────────────────── */}
        <section className="bg-card h-fit rounded-2xl border p-5 shadow-[0_1px_2px_rgb(0_0_0/0.04)] sm:p-6">
          <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
            <BellRing className="text-brand size-5" /> העדפות תקשורת
          </h2>
          <p className="text-muted-foreground mb-4 text-xs">אפשר לשנות בכל רגע. עדכונים על הזמנות במייל יגיעו תמיד.</p>
          <div className="flex flex-col gap-3">
            <ConsentToggle kind="whatsapp" initial={consent.whatsapp} phone={consent.phone} />
            <ConsentToggle kind="marketing" initial={consent.marketing} />
          </div>
        </section>
      </div>
    </div>
  );
}
