import Link from "next/link";
import { HeartHandshake, ShieldAlert, Star, Megaphone } from "lucide-react";
import { requireCatalogPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate, formatPrice } from "@/lib/format";
import { hasMarketingConsent } from "@/lib/marketing-consent";
import { FollowUpButtons } from "@/components/admin/follow-up-buttons";

export const metadata = { title: "מעקב אחרי רכישה | Buy Today Admin" };
export const dynamic = "force-dynamic";

async function requestTime(): Promise<number> {
  return Date.now();
}

const DAY = 86_400_000;
/** From a week after the order (it has usually arrived) to four months. */
const FROM_DAYS = 7;
const TO_DAYS = 120;

/**
 * A week after a purchase: the orders worth a follow-up, and two of them.
 *
 *   ביקורת  — a review request, a service message: every buyer.
 *   מבצע    — the deals and the חבר מביא חבר link: an advertisement, so only
 *             a buyer who did not refuse marketing (lib/marketing-consent).
 *
 * Email goes out at once through the shop's channel; WhatsApp opens a chat
 * with the message typed, to send from the shop's phone. The last send of
 * each kind is shown beside it, so nobody is written to twice by accident.
 */
export default async function FollowUpPage() {
  await requireCatalogPage();
  const now = await requestTime();
  const orders = await db.order.findMany({
    where: {
      createdAt: { lte: new Date(now - FROM_DAYS * DAY), gte: new Date(now - TO_DAYS * DAY) },
      OR: [{ paymentStatus: { in: ["CAPTURED", "AUTHORIZED"] } }, { status: "DELIVERED" }],
      status: { notIn: ["CANCELLED", "REFUNDED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      total: true,
      marketingOptIn: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { name: true, email: true, phone: true, marketingOptIn: true } },
    },
  });
  const logs = await db.auditLog.findMany({
    where: { entityType: "Order", entityId: { in: orders.map((o) => o.id) }, action: { in: ["REVIEW_REQUEST", "REFERRAL_INVITE", "REVIEW_SUBMITTED"] } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, action: true, createdAt: true },
  });
  const last = new Map<string, Date>();
  for (const l of logs) {
    const key = `${l.entityId}:${l.action}`;
    if (!last.has(key)) last.set(key, l.createdAt);
  }
  const allowed = orders.filter((o) => hasMarketingConsent({ userMarketingOptIn: o.user?.marketingOptIn, orderMarketingOptIn: o.marketingOptIn })).length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <HeartHandshake className="text-brand size-6" /> מעקב אחרי רכישה
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          הזמנות שעבר עליהן שבוע עד ארבעה חודשים · {orders.length} הזמנות · {allowed} מותרות לדיוור שיווקי
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="bg-card flex items-start gap-3 rounded-xl border p-4">
          <Star className="mt-0.5 size-5 shrink-0 text-amber-500" />
          <p>
            <b>בקשת ביקורת</b> — הודעת שירות, מותר לכל לקוח. הלקוח מקבל קישור אישי לדירוג המוצרים, והביקורות מחכות
            לאישור ב<Link href="/admin/reviews" className="text-brand underline">אישור ביקורות</Link>.
          </p>
        </div>
        <div className="bg-card flex items-start gap-3 rounded-xl border p-4">
          <Megaphone className="text-brand mt-0.5 size-5 shrink-0" />
          <p>
            <b>מבצע + חבר מביא חבר</b> — פרסומת. רק ללקוח שלא סירב לדיוור, מסומן &quot;פרסומת&quot; ועם קישור הסרה (חוק
            הספאם).
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-xl border p-8 text-center">אין כרגע הזמנות בחלון של שבוע עד ארבעה חודשים.</p>
      ) : (
        <div className="bg-card overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs">
              <tr>
                <th className="p-3 text-start font-medium">הזמנה</th>
                <th className="p-3 text-start font-medium">לקוח</th>
                <th className="p-3 text-start font-medium">סכום</th>
                <th className="p-3 text-start font-medium">בקשת ביקורת</th>
                <th className="p-3 text-start font-medium">מבצע + חבר מביא חבר</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {orders.map((o) => {
                const consent = hasMarketingConsent({ userMarketingOptIn: o.user?.marketingOptIn, orderMarketingOptIn: o.marketingOptIn });
                const hasEmail = !!(o.user?.email ?? o.guestEmail);
                const hasPhone = !!(o.user?.phone ?? o.guestPhone);
                const reviewed = last.get(`${o.id}:REVIEW_SUBMITTED`);
                const askedReview = last.get(`${o.id}:REVIEW_REQUEST`);
                const sentPromo = last.get(`${o.id}:REFERRAL_INVITE`);
                return (
                  <tr key={o.id} className="align-middle">
                    <td className="p-3">
                      <Link href={`/admin/orders/${o.orderNumber}`} className="font-semibold hover:underline">
                        {o.orderNumber}
                      </Link>
                      <div className="text-muted-foreground text-xs">{formatDate(o.createdAt)}</div>
                    </td>
                    <td className="p-3">{o.user?.name ?? o.guestName ?? "—"}</td>
                    <td className="p-3 tabular-nums">{formatPrice(o.total)}</td>
                    <td className="p-3">
                      {reviewed ? (
                        <span className="text-success text-xs font-semibold">✓ דירג/ה ב-{formatDate(reviewed)}</span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <FollowUpButtons orderId={o.id} kind="review" hasEmail={hasEmail} hasPhone={hasPhone} />
                          {askedReview && <span className="text-muted-foreground text-xs">נשלח {formatDate(askedReview)}</span>}
                        </div>
                      )}
                    </td>
                    <td className="p-3">
                      {consent ? (
                        <div className="flex items-center gap-2">
                          <FollowUpButtons orderId={o.id} kind="promo" hasEmail={hasEmail} hasPhone={hasPhone} />
                          {sentPromo && <span className="text-muted-foreground text-xs">נשלח {formatDate(sentPromo)}</span>}
                        </div>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <ShieldAlert className="size-3.5" /> לא אישר/ה דיוור
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
