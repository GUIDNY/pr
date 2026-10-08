import Link from "next/link";
import { requireCatalogPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { isSiteAdmin } from "@/lib/permissions";
import {
  WALLET_ENTRY_KIND_LABELS,
  WALLET_TOPUP_STATUS_LABELS,
  type WalletEntryKind,
  type WalletTopupStatus,
} from "@/lib/enums";
import { walletEnabled } from "@/lib/wallet";
import { WalletAdjustForm } from "@/components/admin/wallet-adjust-form";

export const metadata = { title: "יתרות לקוחות | Buy Today Admin" };
export const dynamic = "force-dynamic";

/**
 * The BuyToday balance from the shop's side: how much customers hold in all
 * (money the shop owes in goods), who holds it, and the ledger and top-ups as
 * they happened. Read-only except for the owner's manual adjustment.
 *
 * Nothing is queried while WALLET_ENABLED is off — the tables may not exist
 * until docs/wallet-ddl.sql has been run.
 */
const money = (agorot: number) => formatPrice(agorot / 100, { decimals: true });

export default async function AdminWalletPage() {
  const session = await requireCatalogPage();

  if (!walletEnabled()) {
    return (
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">יתרות לקוחות</h1>
        <p className="text-muted-foreground text-sm">
          היתרה לקניות כבויה. כדי להפעיל: להריץ פעם אחת את docs/wallet-ddl.sql (npm run db:wallet -- --apply), ואז
          להגדיר WALLET_ENABLED=true ב־Vercel.
        </p>
      </div>
    );
  }

  const [total, byUser, entries, topups] = await Promise.all([
    db.walletEntry.aggregate({ _sum: { amountAgorot: true } }),
    db.walletEntry.groupBy({
      by: ["userId"],
      _sum: { amountAgorot: true },
      orderBy: { _sum: { amountAgorot: "desc" } },
      take: 100,
    }),
    db.walletEntry.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        kind: true,
        amountAgorot: true,
        note: true,
        createdAt: true,
        user: { select: { email: true } },
        order: { select: { orderNumber: true } },
      },
    }),
    db.walletTopup.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        status: true,
        paidAgorot: true,
        creditAgorot: true,
        environment: true,
        approvalNo: true,
        createdAt: true,
        user: { select: { email: true } },
      },
    }),
  ]);
  const holders = byUser.filter((r) => (r._sum.amountAgorot ?? 0) !== 0);
  const users = await db.user.findMany({
    where: { id: { in: holders.map((h) => h.userId) } },
    select: { id: true, email: true, name: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">יתרות לקוחות</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          יתרה לקניות (שקלים) — לא מטבעות המשחק. סך היתרות הוא סחורה שהחנות חייבת ללקוחות.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="bg-card border-border rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">סך היתרות הפתוחות</p>
          <p className="text-2xl font-bold tabular-nums">{money(total._sum.amountAgorot ?? 0)}</p>
        </div>
        <div className="bg-card border-border rounded-xl border p-4">
          <p className="text-muted-foreground text-xs">לקוחות עם יתרה</p>
          <p className="text-2xl font-bold tabular-nums">{holders.length}</p>
        </div>
      </div>

      {isSiteAdmin(session.role) && (
        <section className="bg-card border-border rounded-xl border p-4">
          <h2 className="mb-1 font-semibold">עדכון ידני</h2>
          <p className="text-muted-foreground mb-3 text-xs">
            נרשם כשורה בהיסטוריה עם הסיבה ושמכם. גם הדרך להוריד יתרה אחרי החזר טעינה שבוצע ידנית בפלאקארד.
          </p>
          <WalletAdjustForm />
        </section>
      )}

      <section className="bg-card border-border rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">יתרות</h2>
        {holders.length === 0 ? (
          <p className="text-muted-foreground text-sm">אין יתרות פתוחות.</p>
        ) : (
          <table className="w-full text-sm">
            <tbody className="divide-border divide-y">
              {holders.map((h) => {
                const u = userById.get(h.userId);
                return (
                  <tr key={h.userId}>
                    <td className="py-2">{u?.name ?? "—"}</td>
                    <td className="text-muted-foreground py-2" dir="ltr">
                      {u?.email ?? h.userId}
                    </td>
                    <td className="py-2 text-end font-semibold tabular-nums">{money(h._sum.amountAgorot ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="bg-card border-border rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">טעינות אחרונות</h2>
        <table className="w-full text-sm">
          <tbody className="divide-border divide-y">
            {topups.map((t) => (
              <tr key={t.id}>
                <td className="py-2 whitespace-nowrap">{formatDateTime(t.createdAt)}</td>
                <td className="text-muted-foreground py-2" dir="ltr">
                  {t.user.email}
                </td>
                <td className="py-2 tabular-nums">
                  {money(t.paidAgorot)} → {money(t.creditAgorot)}
                </td>
                <td className="py-2">
                  {WALLET_TOPUP_STATUS_LABELS[t.status as WalletTopupStatus] ?? t.status}
                  {t.environment === "sandbox" ? " · סנדבוקס" : ""}
                </td>
                <td className="text-muted-foreground py-2 text-xs">{t.approvalNo ? `אישור ${t.approvalNo}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="bg-card border-border rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">תנועות אחרונות</h2>
        <table className="w-full text-sm">
          <tbody className="divide-border divide-y">
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="py-2 whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                <td className="text-muted-foreground py-2" dir="ltr">
                  {e.user.email}
                </td>
                <td className="py-2">{WALLET_ENTRY_KIND_LABELS[e.kind as WalletEntryKind] ?? e.kind}</td>
                <td className="py-2">
                  {e.order ? (
                    <Link href={`/admin/orders/${e.order.orderNumber}`} className="underline underline-offset-2">
                      {e.order.orderNumber}
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs">{e.note}</span>
                  )}
                </td>
                <td className={`py-2 text-end font-semibold tabular-nums ${e.amountAgorot > 0 ? "text-success" : ""}`} dir="ltr">
                  {e.amountAgorot > 0 ? "+" : "−"}
                  {money(Math.abs(e.amountAgorot))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
