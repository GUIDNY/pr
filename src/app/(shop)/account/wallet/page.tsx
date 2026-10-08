import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDateTime, formatPrice } from "@/lib/format";
import { paymentLaneFor } from "@/lib/pelecard/config";
import { WALLET_ENTRY_KIND_LABELS, type WalletEntryKind } from "@/lib/enums";
import { WALLET_PACKAGES, walletBalanceAgorot, walletEnabled, walletHistory } from "@/lib/wallet";
import { TopupButton, TopupPendingRefresh } from "@/components/account/wallet-topup";

export const metadata = { title: "היתרה שלי" };
export const dynamic = "force-dynamic";

/**
 * The customer's BuyToday balance: what is in it, the three packages it can
 * be topped up with, and every line of its history. The 3D mall links here
 * (/account/wallet) for anything to do with the balance.
 *
 * Pelecard sends the customer back with ?topup=<id>&result=…, and that
 * result is the browser's word, which credits nothing — the banner reads the
 * top-up's own status from the database, and while the callback has not
 * landed yet it says so and refreshes itself.
 */
const money = (agorot: number) => formatPrice(agorot / 100, { decimals: agorot % 100 !== 0 });

export default async function WalletPage({
  searchParams,
}: {
  searchParams: Promise<{ topup?: string; result?: string }>;
}) {
  if (!walletEnabled()) notFound();
  const user = await getCurrentUser();
  if (!user) return null;

  const { topup: topupId, result } = await searchParams;
  const [balance, history, returned] = await Promise.all([
    walletBalanceAgorot(user.id),
    walletHistory(user.id),
    topupId
      ? db.walletTopup.findFirst({
          where: { id: topupId, userId: user.id },
          select: { status: true, creditAgorot: true, createdAt: true },
        })
      : null,
  ]);
  const canTopUp = paymentLaneFor({ email: user.email, role: user.role }) === "gateway";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">היתרה שלי</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          טוענים יתרה פעם אחת, מקבלים בונוס, ומשלמים על הזמנות באתר בלי להזין כרטיס בכל פעם.
        </p>
      </div>

      {returned && returned.status === "PAID" && (
        <p className="border-success/40 bg-success/10 rounded-lg border p-3 text-sm font-medium">
          הטעינה הושלמה — {money(returned.creditAgorot)} נוספו ליתרה שלכם.
        </p>
      )}
      {returned && returned.status === "PENDING" && result === "success" && (
        <>
          <p className="border-border bg-muted rounded-lg border p-3 text-sm">
            מאשרים את התשלום מול חברת הסליקה… היתרה תתעדכן כאן בעוד רגע.
          </p>
          <TopupPendingRefresh />
        </>
      )}
      {returned && (returned.status === "FAILED" || (returned.status === "PENDING" && result !== "success")) && (
        <p className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-3 text-sm">
          הטעינה לא הושלמה ולא נוספה יתרה. אם חויבתם בכל זאת, צרו קשר ונבדוק מול חברת הסליקה.
        </p>
      )}

      <section className="from-brand to-brand-hover text-brand-foreground relative overflow-hidden rounded-2xl bg-gradient-to-l p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm opacity-85">יתרה לקניות</p>
            <p className="mt-1 text-4xl font-extrabold tabular-nums">{money(balance)}</p>
            <p className="mt-2 text-sm opacity-85">
              {balance > 0 ? "אפשר לשלם בה בעמוד התשלום, כשהיא מכסה את כל ההזמנה." : "עוד לא טענתם יתרה."}
            </p>
          </div>
          <Wallet className="size-12 opacity-30" />
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">טעינת יתרה</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {WALLET_PACKAGES.map((p) => {
            const bonus = p.creditAgorot - p.paidAgorot;
            return (
              <li key={p.id} className="border-border flex flex-col gap-3 rounded-xl border p-4 text-center">
                <div>
                  <p className="text-muted-foreground text-xs">משלמים</p>
                  <p className="text-xl font-bold tabular-nums">{money(p.paidAgorot)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">מקבלים ליתרה</p>
                  <p className="text-brand text-2xl font-extrabold tabular-nums">{money(p.creditAgorot)}</p>
                  <p className="bg-brand/10 text-brand mx-auto mt-1 w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold">
                    {money(bonus)} בונוס
                  </p>
                </div>
                <TopupButton packageId={p.id} label={`טעינה ב־${money(p.paidAgorot)}`} disabled={!canTopUp} />
              </li>
            );
          })}
        </ul>
        {!canTopUp && (
          <p className="text-muted-foreground mt-2 text-xs">טעינת יתרה בכרטיס אינה זמינה כרגע לחשבון הזה.</p>
        )}
        <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
          התשלום מתבצע בטופס המאובטח של חברת הסליקה. היתרה משמשת לקניית מוצרים באתר BuyToday בלבד,
          ואינה קשורה למטבעות המשחק בקניון. לשאלות על החזר יתרה —{" "}
          <Link href="/contact" className="hover:text-foreground underline underline-offset-2">
            צרו קשר
          </Link>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-semibold">היסטוריה</h2>
        {history.length === 0 ? (
          <p className="text-muted-foreground border-border rounded-xl border p-6 text-center text-sm">אין עדיין תנועות ביתרה.</p>
        ) : (
          <ul className="divide-border border-border divide-y rounded-xl border">
            {history.map((e) => {
              const credit = e.amountAgorot > 0;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`grid size-8 shrink-0 place-items-center rounded-full ${credit ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-medium">
                        {WALLET_ENTRY_KIND_LABELS[e.kind as WalletEntryKind] ?? e.kind}
                        {e.order && (
                          <Link
                            href={`/account/orders/${e.order.orderNumber}`}
                            className="text-muted-foreground hover:text-foreground mr-1.5 font-normal underline underline-offset-2"
                          >
                            {e.order.orderNumber}
                          </Link>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">{formatDateTime(e.createdAt)}</p>
                    </div>
                  </div>
                  <span className={`shrink-0 font-semibold tabular-nums ${credit ? "text-success" : ""}`} dir="ltr">
                    {credit ? "+" : "−"}
                    {money(Math.abs(e.amountAgorot))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
