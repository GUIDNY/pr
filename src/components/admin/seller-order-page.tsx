"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight, Truck, Store, Phone, Mail, AlertTriangle, Check, Loader2,
  Package, Clock, MessageSquare, CreditCard, Send, Undo2, Trash2, ExternalLink,
} from "lucide-react";
import type { SellerOrderDetail } from "@/lib/queries/seller-orders";
import { paymentSignal, SIGNAL_DOT, SIGNAL_CHIP } from "@/lib/order-signal";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";
import { NOTIFY_CHANNEL_LABELS, NOTIFY_EVENT_LABELS } from "@/lib/notify/types";
import { stageOf } from "@/lib/order-stage";
import { formatPrice, formatDateTime } from "@/lib/format";
import {
  approveOrderAction, closeOrderAction, markShippedAction, logManualWhatsappAction,
  undoLastStatusAction, deleteOrderAction, resendNotificationAction,
} from "@/actions/seller-orders";
import { COURIERS } from "@/lib/couriers";

/**
 * One order, everything about it, and the one action it is actually waiting
 * for.
 *
 * The page is ordered by what a person needs in the order they need it:
 * money at the top because it decides whether anything else may happen,
 * then the customer and where it is going, then what is in it, then what has
 * been said to them, then the history. The single action bar sits under the
 * money rather than at the bottom, because the bottom is a scroll away on a
 * phone and this is the reason the page was opened.
 *
 * There is exactly one primary button at any moment, and which one it is
 * comes from the order's own state. A screen offering approve, ship and
 * close at once asks the person to know the order of operations; a screen
 * offering the next one asks them to press it.
 */
export function SellerOrderPage({ order }: { order: SellerOrderDetail }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [courier, setCourier] = useState({ name: "", trackingNumber: "", trackingUrl: "" });
  /* Deleting is two clicks, and the second one is the one that is armed. Not
     a confirm() dialog: those are dismissed by muscle memory, and this is the
     only irreversible button on the page. */
  const [confirming, setConfirming] = useState<"idle" | "ready">("idle");

  const signal = paymentSignal(order.paymentStatus);
  const stage = stageOf(order.status);
  const blocked = order.problems.some((p) => p.severity === "block");

  function run(action: () => Promise<{ success: boolean; error: string | null }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.success) setError(result.error);
      else setShipOpen(false);
    });
  }

  const needsApproval = stage === "open" && (order.paymentStatus === "AUTHORIZED" || order.paymentStatus === "CAPTURED");
  const canShip = stage === "processing" && order.status !== "SHIPPED" && order.paymentStatus === "CAPTURED";
  const canClose = stage === "processing" && order.paymentStatus === "CAPTURED";

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/admin/orders?stage=${stage}`} className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm">
        <ArrowRight className="size-4" /> חזרה לרשימה
      </Link>

      {/* ---- money, and the action it permits ---- */}
      <section className="border-border bg-background rounded-2xl border p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-base font-black ${SIGNAL_CHIP[signal.colour]}`}>
            <span className={`size-3 rounded-full ${SIGNAL_DOT[signal.colour]}`} aria-hidden="true" />
            {signal.label}
          </span>
          <div>
            <div className="text-xl font-black">{order.orderNumber}</div>
            <div className="text-muted-foreground text-sm">הוזמן {formatDateTime(order.createdAt)}</div>
          </div>
          <div className="ms-auto text-end">
            <div className="text-2xl font-black">{formatPrice(order.total)}</div>
            <div className="text-muted-foreground text-xs">{ORDER_STATUS_LABELS[order.status as OrderStatus]}</div>
          </div>
        </div>

        <p className="text-muted-foreground mt-2 text-sm">{signal.hint}</p>

        {order.paid?.holdExpiresAt && order.paymentStatus === "AUTHORIZED" && (
          <p className="bg-warning/10 text-warning-foreground mt-3 rounded-lg px-3 py-2 text-sm font-medium">
            התפיסה תקפה עד {formatDateTime(order.paid.holdExpiresAt)}. אחרי זה הכסף משתחרר ללקוח וצריך לגבות מחדש.
          </p>
        )}

        {error && (
          <p className="bg-destructive/10 text-destructive mt-3 rounded-lg px-3 py-2 text-sm font-medium">{error}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {needsApproval && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => approveOrderAction(order.orderNumber))}
              className="bg-brand text-brand-foreground hover:bg-brand-hover flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              {order.paymentStatus === "AUTHORIZED" ? "אשר תשלום וגבה" : "אשר הזמנה"}
            </button>
          )}
          {canShip && !shipOpen && (
            <button
              type="button"
              onClick={() => setShipOpen(true)}
              className="bg-brand text-brand-foreground hover:bg-brand-hover flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold"
            >
              <Truck className="size-4" /> יצא למשלוח
            </button>
          )}
          {canClose && (
            <button
              type="button"
              disabled={pending || blocked}
              onClick={() => run(() => closeOrderAction(order.orderNumber))}
              title={blocked ? "יש בעיה פתוחה בהזמנה" : undefined}
              className="border-border hover:bg-muted rounded-lg border px-5 py-2.5 text-sm font-bold disabled:opacity-50"
            >
              נמסר ללקוח — סגור
            </button>
          )}
          {/* The way back. Every other button here moves the order forward,
              and pressing one on the wrong row used to be final — which is
              the worst shape a mistake can take: instant, silent, and
              somebody else's to fix. */}
          {order.previousStatus && (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => undoLastStatusAction(order.orderNumber))}
              className="text-muted-foreground hover:text-foreground hover:bg-muted ms-auto flex items-center gap-1.5 rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-50"
            >
              <Undo2 className="size-4" />
              בטל — חזור ל{ORDER_STATUS_LABELS[order.previousStatus as OrderStatus] ?? order.previousStatus}
            </button>
          )}
        </div>

        {shipOpen && (
          <div className="border-border mt-3 flex flex-col gap-2 rounded-xl border p-3">
            <p className="text-sm font-bold">פרטי המשלוח</p>
            <input
              value={courier.name}
              onChange={(e) => setCourier({ ...courier, name: e.target.value })}
              placeholder="חברת שליחויות (למשל: חץ, בראל, דואר ישראל)"
              className="border-border rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={courier.trackingNumber}
              onChange={(e) => setCourier({ ...courier, trackingNumber: e.target.value })}
              placeholder="מספר מעקב (אופציונלי)"
              className="border-border rounded-lg border px-3 py-2 text-sm"
            />
            <input
              value={courier.trackingUrl}
              onChange={(e) => setCourier({ ...courier, trackingUrl: e.target.value })}
              placeholder="קישור מעקב אצל השליח (אופציונלי)"
              dir="ltr"
              className="border-border rounded-lg border px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || !courier.name.trim()}
                onClick={() => run(() => markShippedAction(order.orderNumber, courier))}
                className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {pending ? "שולח…" : "אשר יציאה ושלח עדכון ללקוח"}
              </button>
              <button type="button" onClick={() => setShipOpen(false)} className="border-border rounded-lg border px-4 py-2 text-sm">
                ביטול
              </button>
            </div>
          </div>
        )}
      </section>

      {order.problems.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {order.problems.map((problem, i) => (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-lg px-3 py-2 text-sm ${
                problem.severity === "block" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning-foreground"
              }`}
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {problem.text}
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---- customer and destination ---- */}
        <Panel title="הלקוח והיעד" icon={order.delivery.toCustomer ? Truck : Store}>
          <Field label="שם">{order.customerName}</Field>
          {order.customerPhone && (
            <Field label="טלפון">
              <a href={`tel:${order.customerPhone}`} className="text-brand flex items-center gap-1.5">
                <Phone className="size-3.5" /> {order.customerPhone}
              </a>
            </Field>
          )}
          {order.customerEmail && (
            <Field label="מייל">
              <a href={`mailto:${order.customerEmail}`} className="text-brand flex items-center gap-1.5 break-all">
                <Mail className="size-3.5" /> {order.customerEmail}
              </a>
            </Field>
          )}
          <Field label="אופן מסירה">
            {order.delivery.toCustomer ? "משלוח עד הבית" : "איסוף עצמי מהחנות"}
            {order.delivery.toCustomer && (order.delivery.fee > 0 ? ` · ${formatPrice(order.delivery.fee)}` : " · ללא חיוב")}
          </Field>
          {order.delivery.toCustomer && <Field label="כתובת">{order.delivery.address ?? "— חסרה —"}</Field>}
          {order.customerNote && <Field label="הערת הלקוח">{order.customerNote}</Field>}
          {order.courier.name && (
            <>
              <Field label="שליח">{order.courier.name}</Field>
              {order.courier.trackingNumber && <Field label="מספר מעקב">{order.courier.trackingNumber}</Field>}
              {order.courier.trackingUrl && (
                <Field label="מעקב">
                  <a href={order.courier.trackingUrl} target="_blank" rel="noopener noreferrer" className="text-brand break-all">
                    {order.courier.trackingUrl}
                  </a>
                </Field>
              )}
              {order.shippedAt && <Field label="יצא">{formatDateTime(order.shippedAt)}</Field>}
              {order.deliveredAt && <Field label="נמסר">{formatDateTime(order.deliveredAt)}</Field>}
            </>
          )}
        </Panel>

        {/* ---- what was charged ---- */}
        <Panel title="תשלום" icon={CreditCard}>
          <Field label="סכום ביניים">{formatPrice(order.subtotal)}</Field>
          {order.discountTotal > 0 && (
            <Field label={`הנחה${order.couponCode ? ` (${order.couponCode})` : ""}`}>
              −{formatPrice(order.discountTotal)}
            </Field>
          )}
          <Field label="משלוח">{order.delivery.fee > 0 ? formatPrice(order.delivery.fee) : "ללא חיוב"}</Field>
          <Field label="סה״כ להזמנה">
            <span className="font-black">{formatPrice(order.total)}</span>
          </Field>
          <Field label="אמצעי תשלום">{order.paymentMethod ?? "—"}</Field>
          {order.paid ? (
            <>
              <Field label={order.paymentStatus === "AUTHORIZED" ? "נתפס בכרטיס" : "נגבה בפועל"}>
                {formatPrice(order.paid.heldAmount ?? order.paid.amount)}
              </Field>
              {order.paid.capturedAt && <Field label="מועד גבייה">{formatDateTime(order.paid.capturedAt)}</Field>}
            </>
          ) : (
            <Field label="תשלום">עוד לא נפתח</Field>
          )}
        </Panel>

        {/* ---- the goods ---- */}
        <Panel title="פריטים" icon={Package}>
          <ul className="flex flex-col gap-2">
            {order.items.map((item, i) => (
              <li key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-bold">{item.quantity}×</span>
                <span className="flex-1">
                  {item.title}
                  <span className="text-muted-foreground block text-xs">
                    {item.sku}
                    {item.inStock !== null && ` · במלאי ${item.inStock}`}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">{formatPrice(item.price * item.quantity)}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* ---- what the customer was told ---- */}
        <Panel title="עדכונים ללקוח" icon={MessageSquare}>
          <p className="text-muted-foreground -mt-1 mb-1 text-xs">
            מייל נשלח לבד. וואטסאפ נפתח אצלך מוכן לשליחה עד שמטא מאשרים את התבניות, ואז יישלח לבד גם הוא.
          </p>
          <ul className="flex flex-col gap-2">
            {order.updates.map((update) => (
              <li
                key={update.event}
                className={`border-border rounded-lg border p-2.5 ${update.due ? "" : "opacity-50"}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 text-sm font-bold">{NOTIFY_EVENT_LABELS[update.event]}</span>
                  {update.channels.map((c) => (
                    <span
                      key={c.channel}
                      title={c.error ?? undefined}
                      className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${
                        c.status === "SENT"
                          ? "bg-success/15 text-success"
                          : c.status === "FAILED"
                            ? "bg-destructive/15 text-destructive"
                            : c.status === "SKIPPED"
                              ? "bg-muted text-muted-foreground"
                              : "border-border text-muted-foreground border border-dashed"
                      }`}
                    >
                      {NOTIFY_CHANNEL_LABELS[c.channel]}
                    </span>
                  ))}
                </div>
                {update.due && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => resendNotificationAction(order.orderNumber, update.event))}
                      className="border-border hover:bg-muted flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold disabled:opacity-50"
                    >
                      <Mail className="size-3.5" /> שלח מייל
                    </button>
                    {update.whatsappHref && (
                      <a
                        href={update.whatsappHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => void logManualWhatsappAction(order.orderNumber, update.event)}
                        className="bg-success/15 text-success hover:bg-success/25 flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold"
                      >
                        <Send className="size-3.5" /> שלח וואטסאפ
                      </a>
                    )}
                  </div>
                )}
                {update.channels.find((c) => c.error) && (
                  <p className="text-muted-foreground mt-1.5 text-xs">
                    {update.channels.find((c) => c.error)?.error}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Panel>

        {/* ---- the couriers themselves ---- */}
        <Panel title="חברות שליחויות" icon={Truck}>
          {order.courier.trackingUrl && (
            <a
              href={order.courier.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-brand/10 text-brand hover:bg-brand/20 mb-2 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold"
            >
              <ExternalLink className="size-4" />
              מעקב אחרי המשלוח של ההזמנה הזאת
            </a>
          )}
          <ul className="flex flex-col gap-1">
            {COURIERS.map((courier) => (
              <li key={courier.id} className="flex items-center gap-2 text-sm">
                <a
                  href={courier.site}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand flex flex-1 items-center gap-1.5"
                >
                  <ExternalLink className="size-3.5 shrink-0" />
                  {courier.name}
                </a>
                {courier.phone && (
                  <a href={`tel:${courier.phone}`} className="text-muted-foreground shrink-0 text-xs">
                    {courier.phone}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* ---- history ---- */}
      <Panel title="היסטוריה" icon={Clock}>
        <ul className="flex flex-col gap-2 text-sm">
          {order.history.map((h, i) => (
            <li key={i} className="border-border flex flex-col border-s-2 ps-3">
              <span className="font-semibold">
                {ORDER_STATUS_LABELS[h.to as OrderStatus] ?? h.to}
                {h.by && <span className="text-muted-foreground font-normal"> · {h.by}</span>}
              </span>
              {h.note && <span className="text-muted-foreground text-xs">{h.note}</span>}
              <span className="text-muted-foreground text-xs">{formatDateTime(h.at)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---- the exit for something that should not exist ---- */}
      <div className="border-border mt-2 rounded-2xl border border-dashed p-4">
        <p className="text-muted-foreground text-xs">
          {order.canDelete
            ? "מחיקה מוחקת את ההזמנה לגמרי ואי אפשר לשחזר. מיועדת להזמנות בדיקה ולטעויות שלא נגבה בהן כסף."
            : "בהזמנה הזאת נגבה או נתפס כסף אמיתי, ולכן אי אפשר למחוק אותה — זה רישום כספי. אפשר לבטל אותה, והביטול נשמר."}
        </p>
        <button
          type="button"
          disabled={pending || !order.canDelete || confirming !== "ready"}
          onClick={() => run(() => deleteOrderAction(order.orderNumber))}
          className="text-destructive hover:bg-destructive/10 mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
        >
          <Trash2 className="size-4" /> מחק את ההזמנה לצמיתות
        </button>
        {order.canDelete && confirming !== "ready" && (
          <button
            type="button"
            onClick={() => setConfirming("ready")}
            className="text-muted-foreground hover:text-foreground mt-1 block text-xs underline"
          >
            אני רוצה למחוק — פתח את הכפתור
          </button>
        )}
      </div>
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-background rounded-2xl border p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-black">
        <Icon className="text-brand size-4" />
        {title}
      </h2>
      <div className="flex flex-col gap-1.5">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 text-sm">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="flex-1">{children}</span>
    </div>
  );
}