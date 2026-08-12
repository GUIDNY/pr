import Link from "next/link";
import { AlertTriangle, Package, Receipt, RotateCcw, ShoppingBag, TrendingUp, XCircle } from "lucide-react";
import { getDashboardStats } from "@/lib/queries/admin";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { formatPrice, formatDate } from "@/lib/format";
import { ORDER_STATUS_LABELS, ORDER_STATUS_COLORS, type OrderStatus } from "@/lib/enums";

export const metadata = { title: "לוח בקרה | PREC Admin" };

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats();

  const tiles = [
    { label: "הזמנות היום", value: stats.ordersToday, icon: ShoppingBag },
    { label: "הכנסות היום", value: formatPrice(stats.revenueToday), icon: TrendingUp },
    { label: "ערך הזמנה ממוצע", value: formatPrice(Math.round(stats.avgOrderValue)), icon: Receipt },
    { label: "הזמנות ממתינות", value: stats.pendingOrders, icon: Package },
    { label: "ביטולים (7 ימים)", value: stats.cancellations, icon: XCircle },
    { label: "זיכויים (7 ימים)", value: stats.refunds, icon: RotateCcw },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">לוח בקרה</h1>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="border-border bg-card rounded-xl border p-4">
            <t.icon className="text-brand mb-2 size-5" />
            <p className="text-xl font-bold tabular-nums">{t.value}</p>
            <p className="text-muted-foreground text-xs">{t.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="border-border bg-card rounded-xl border p-5 lg:col-span-2">
          <h2 className="mb-4 font-semibold">הכנסות - 7 ימים אחרונים</h2>
          <RevenueChart data={stats.revenueByDay} />
        </div>

        <div className="border-border bg-card rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">מוצרים מובילים</h2>
          {stats.topProducts.length === 0 ? (
            <p className="text-muted-foreground text-sm">אין עדיין נתונים</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {stats.topProducts.map((p, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate">{p.title}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">{p.qty} יח&apos;</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="border-border bg-card rounded-xl border p-5 lg:col-span-2">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="text-warning-foreground size-5" />
            <h2 className="font-semibold">הזמנות שדורשות תשומת לב</h2>
          </div>
          {stats.attentionOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">אין הזמנות תקועות כרגע — כל הכבוד!</p>
          ) : (
            <ul className="divide-border divide-y">
              {stats.attentionOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                  <Link href={`/admin/orders/${o.orderNumber}`} className="hover:underline">
                    {o.orderNumber}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ORDER_STATUS_COLORS[o.status as OrderStatus]}`}>
                    {ORDER_STATUS_LABELS[o.status as OrderStatus]}
                  </span>
                  <span className="text-muted-foreground">{formatDate(o.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-border bg-card rounded-xl border p-5">
          <h2 className="mb-4 font-semibold">ביצועי קטגוריות</h2>
          <ul className="flex flex-col gap-3">
            {stats.categoryPerformance.map((c) => (
              <li key={c.name} className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span className="text-muted-foreground tabular-nums">{c.productCount} מוצרים</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
