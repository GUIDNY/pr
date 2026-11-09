import { Gift, ShieldAlert } from "lucide-react";
import { db } from "@/lib/db";
import { hasMarketingConsent } from "@/lib/marketing-consent";
import { customerHasPaid } from "@/lib/order-signal";
import { formatDateTime } from "@/lib/format";
import { ReferralInviteButtons } from "@/components/admin/referral-invite-buttons";

/**
 * חבר מביא חבר on a finished order: send the buyer their invitation —
 * only when the law allows it. See actions/referral-invite.ts.
 */
export async function ReferralInvitePanel({ orderNumber }: { orderNumber: string }) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      status: true,
      paymentStatus: true,
      marketingOptIn: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { email: true, phone: true, marketingOptIn: true } },
    },
  });
  if (!order) return null;
  const finished = customerHasPaid(order.paymentStatus) || order.status === "DELIVERED";
  if (!finished) return null;

  const consent = hasMarketingConsent({ userMarketingOptIn: order.user?.marketingOptIn, orderMarketingOptIn: order.marketingOptIn });
  const last = await db.auditLog.findFirst({
    where: { action: "REFERRAL_INVITE", entityType: "Order", entityId: order.id },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, metadata: true },
  });

  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Gift className="text-brand size-4" /> חבר מביא חבר
      </h2>
      {consent ? (
        <>
          <p className="text-muted-foreground mb-3 text-sm">
            הלקוח אישר קבלת מבצעים. ההודעה מסומנת &quot;פרסומת&quot; וכוללת קישור הסרה.
            {!order.user && " הלקוח קנה כאורח — ההודעה תזמין אותו לפתוח חשבון ולקבל קישור אישי."}
          </p>
          <ReferralInviteButtons
            orderId={order.id}
            hasEmail={!!(order.user?.email ?? order.guestEmail)}
            hasPhone={!!(order.user?.phone ?? order.guestPhone)}
          />
          {last && (
            <p className="text-muted-foreground mt-2 text-xs">
              נשלח לאחרונה: {formatDateTime(last.createdAt)}
            </p>
          )}
        </>
      ) : (
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <ShieldAlert className="mt-0.5 size-4 shrink-0" />
          הלקוח לא אישר קבלת פרסומות, ולכן אסור לשלוח לו את ההזמנה (חוק הספאם, עד 1,000 ₪ קנס להודעה). הוא עדיין יכול לשתף
          בעצמו את הקישור שלו מהאזור האישי.
        </p>
      )}
    </div>
  );
}
