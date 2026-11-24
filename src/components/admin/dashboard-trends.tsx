import Link from "next/link";
import { Receipt, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { CHANNEL_LABELS } from "@/lib/admin/order-channel";
import { getChannels, getFunnel, getKpiComparison, getTrend } from "@/lib/queries/admin-trends";
import { DeltaBadge } from "@/components/admin/delta-badge";
import { ChannelWeeksChart, FunnelTrendChart, ProfitChart, TrendChart } from "@/components/admin/dashboard-trend-charts";

export type TrendParams = { range: 7 | 30 | 90; grain: "day" | "week"; touch: "first" | "last" };

export function parseTrendParams(sp: { range?: string; grain?: string; touch?: string }): TrendParams {
  const range = sp.range === "7" ? 7 : sp.range === "90" ? 90 : 30;
  /* Ninety days by the day is ninety bars on a phone; default to weeks there. */
  const grain = sp.grain === "day" ? "day" : sp.grain === "week" ? "week" : range === 90 ? "week" : "day";
  return { range, grain, touch: sp.touch === "first" ? "first" : "last" };
}

function href(p: TrendParams, over: Partial<Record<keyof TrendParams, string | number>>) {
  const q = new URLSearchParams({ range: String(p.range), grain: p.grain, touch: p.touch });
  for (const [key, v] of Object.entries(over)) q.set(key, String(v));
  return `/admin?${q.toString()}#trends`;
}

function Pills<T extends string | number>({
  options,
  current,
  link,
}: {
  options: { value: T; label: string }[];
  current: T;
  link: (v: T) => string;
}) {
  return (
    <div className="bg-muted/60 inline-flex rounded-lg p-0.5 text-xs font-medium">
      {options.map((o) => (
        <Link
          key={String(o.value)}
          href={link(o.value)}
          scroll={false}
          className={`rounded-md px-3 py-1.5 ${o.value === current ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}

export async function KpiComparisonCards() {
  const k = await getKpiComparison();
  const periods = [
    { key: "today", label: "היום", vs: "מול אותו יום בשבוע שעבר", data: k.today },
    { key: "week", label: "7 ימים", vs: "מול 7 הימים שלפניהם", data: k.week },
    { key: "month", label: "30 יום", vs: "מול 30 הימים שלפניהם", data: k.month },
  ] as const;
  const cards = [
    { label: "הזמנות", icon: ShoppingBag, pick: (p: typeof k.today) => p.orders, fmt: (n: number) => Math.round(n).toLocaleString("he-IL") },
    { label: "הכנסות", icon: TrendingUp, pick: (p: typeof k.today) => p.revenue, fmt: (n: number) => formatPrice(Math.round(n)) },
    { label: "ערך הזמנה ממוצע", icon: Receipt, pick: (p: typeof k.today) => p.aov, fmt: (n: number) => formatPrice(Math.round(n)) },
    { label: "רווח גולמי", icon: Wallet, pick: (p: typeof k.today) => p.profit, fmt: (n: number) => formatPrice(Math.round(n)) },
  ];
  return (
    <section aria-label="השוואה לתקופה קודמת" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">האם אנחנו משתפרים?</h2>
        <p className="text-muted-foreground text-xs">הזמנות ששולמו, בלי מבוטלות ובלי מחוקות · שעון ישראל</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="border-border bg-card rounded-xl border p-4">
            <div className="mb-3 flex items-center gap-2">
              <c.icon className="text-brand size-5" />
              <p className="text-sm font-semibold">{c.label}</p>
            </div>
            <ul className="divide-border divide-y">
              {periods.map((p) => {
                const v = c.pick(p.data);
                return (
                  <li key={p.key} className="flex items-center justify-between gap-2 py-2" title={p.vs}>
                    <div className="min-w-0">
                      <p className="text-lg leading-tight font-bold tabular-nums">{c.fmt(v.cur)}</p>
                      <p className="text-muted-foreground text-[11px]">
                        {p.label} · קודם {c.fmt(v.prev)}
                      </p>
                    </div>
                    <DeltaBadge cur={v.cur} prev={v.prev} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const card = "border-border bg-card rounded-xl border p-5";

export async function DashboardTrends({ params }: { params: TrendParams }) {
  const [trend, funnel, channels] = await Promise.all([
    getTrend(params.range),
    getFunnel(params.range, params.grain),
    getChannels(params.range, params.touch),
  ]);
  const sum = (f: (b: (typeof funnel)[number]) => number) => funnel.reduce((s, b) => s + f(b), 0);
  const visitors = sum((b) => b.visitors);
  const steps = [
    { label: "מבקרים (שראו את באנר העוגיות)", n: visitors },
    { label: "הוספה לעגלה", n: sum((b) => b.addToCart) },
    { label: "תחילת צ׳קאאוט", n: sum((b) => b.checkout) },
    { label: "שליחת תשלום", n: sum((b) => b.payment) },
    { label: "הזמנה ששולמה", n: sum((b) => b.orders) },
  ];
  const widest = Math.max(1, ...steps.map((s) => s.n));
  const totalRate = visitors > 0 ? Math.round((steps[4].n / visitors) * 1000) / 10 : null;
  const chTotalOrders = channels.totals.reduce((s, c) => s + c.orders, 0);

  return (
    <div id="trends" className="flex flex-col gap-6 scroll-mt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">מגמות</h2>
        <Pills
          options={[
            { value: 7, label: "7 ימים" },
            { value: 30, label: "30 יום" },
            { value: 90, label: "90 יום" },
          ]}
          current={params.range}
          link={(v) => href(params, { range: v, grain: v === 90 ? "week" : params.grain })}
        />
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">הכנסות והזמנות ליום</h3>
          <p className="text-muted-foreground text-xs">הקו המקווקו: אותה תקופה קודמת</p>
        </div>
        <TrendChart data={trend.points} />
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">רווח גולמי מצטבר</h3>
          <p className="text-muted-foreground text-xs">
            מחיר מכירה פחות הנחות פחות עלות ספק, כמו ב״רווח גולמי״ · לפני משלוח, סליקה ומע״מ
          </p>
        </div>
        <ProfitChart data={trend.points} />
        <p className="mt-2 text-sm font-medium tabular-nums">
          סה״כ בטווח: {formatPrice(Math.round(trend.points.at(-1)?.profitCum ?? 0))}
          {trend.missingCost > 0 && (
            <span className="text-warning-foreground ms-2 text-xs font-normal">
              {trend.missingCost} פריטים ללא עלות ספק נספרו במחזור ולא בעלות
            </span>
          )}
        </p>
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">משפך המרה</h3>
          <Pills
            options={[
              { value: "day", label: "לפי יום" },
              { value: "week", label: "לפי שבוע" },
            ]}
            current={params.grain}
            link={(v) => href(params, { grain: v })}
          />
        </div>
        <ul className="mb-4 flex flex-col gap-2">
          {steps.map((s, i) => (
            <li key={s.label} className="text-sm">
              <div className="mb-1 flex items-baseline justify-between gap-2">
                <span>{s.label}</span>
                <span className="tabular-nums">
                  <b>{s.n.toLocaleString("he-IL")}</b>
                  {i > 0 && steps[i - 1].n > 0 && (
                    <span className="text-muted-foreground ms-2 text-xs">
                      <bdi>{Math.round((s.n / steps[i - 1].n) * 100)}%</bdi> מהשלב הקודם
                    </span>
                  )}
                </span>
              </div>
              <div className="bg-muted h-2 rounded-full">
                <div className="bg-brand h-2 rounded-full" style={{ width: `${Math.max(2, (s.n / widest) * 100)}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <p className="mb-2 text-sm font-medium">
          שיעור המרה כולל: {totalRate === null ? "—" : `${totalRate.toLocaleString("he-IL")}%`}
        </p>
        <FunnelTrendChart data={funnel} />
        <p className="text-muted-foreground mt-2 text-xs">
          מבקרים אמיתיים בלבד: בלי בוטים ובלי /admin. ״מבקרים״ נספרים מאירוע הצגת באנר העוגיות, ולכן מי שכבר בחר בעבר
          לא נכלל בו; ההזמנות נספרות מטבלת ההזמנות עצמה. השלבים הם ביקורים ייחודיים ליום, ולא אנשים.
        </p>
      </div>

      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">מקורות הזמנות</h3>
          <Pills
            options={[
              { value: "last", label: "מגע אחרון" },
              { value: "first", label: "מגע ראשון" },
            ]}
            current={params.touch}
            link={(v) => href(params, { touch: v })}
          />
        </div>
        {chTotalOrders === 0 ? (
          <p className="text-muted-foreground text-sm">אין הזמנות בטווח.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="py-1 text-start font-medium">מקור</th>
                    <th className="py-1 text-end font-medium">הזמנות</th>
                    <th className="py-1 text-end font-medium">אחוז</th>
                    <th className="py-1 text-end font-medium">הכנסות</th>
                  </tr>
                </thead>
                <tbody className="divide-border divide-y">
                  {channels.totals.map((c) => (
                    <tr key={c.channel}>
                      <td className="py-2">{CHANNEL_LABELS[c.channel]}</td>
                      <td className="py-2 text-end tabular-nums">{c.orders.toLocaleString("he-IL")}</td>
                      <td className="text-muted-foreground py-2 text-end tabular-nums">
                        {Math.round((c.orders / chTotalOrders) * 100)}%
                      </td>
                      <td className="py-2 text-end font-medium tabular-nums">{formatPrice(Math.round(c.revenue))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 mb-1 text-sm font-medium">הזמנות לפי מקור, לפי שבוע (מתחילים ביום ראשון)</p>
            <ChannelWeeksChart data={channels.weeks} />
          </>
        )}
        <p className="text-muted-foreground mt-2 text-xs">
          מגע אחרון: הלחיצה האחרונה לפני ההזמנה. מגע ראשון: מה שהביא את האדם לאתר. הזמנה בלי מידע על מקור נספרת כישירה.
          ״גוגל ממומן״ כולל gclid, cpc ופרסום בשופינג.
        </p>
      </div>
    </div>
  );
}
