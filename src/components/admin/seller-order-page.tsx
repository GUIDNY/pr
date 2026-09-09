"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowRight, Truck, Store, Phone, Mail, AlertTriangle, Check, Loader2,
  Package, Clock, MessageSquare, CreditCard, Send,
} from "lucide-react";
import type { SellerOrderDetail } from "@/lib/queries/seller-orders";
import { paymentSignal, SIGNAL_DOT, SIGNAL_CHIP } from "@/lib/order-signal";
import { ORDER_STATUS_LABELS, type OrderStatus } from "@/lib/enums";
import { NOTIFY_CHANNEL_LABELS, NOTIFY_EVENT_LABELS, type NotifyChannel, type NotifyEvent } from "@/lib/notify/types";
import { stageOf } from "@/lib/order-stage";
import { formatPrice, formatDateTime } from "@/lib/format";
import { approveOrderAction, closeOrderAction, markShippedAction, logManualWhatsappAction } from "@/actions/seller-orders";

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
          {/* Manual until Meta approve the templates. The link opens the
              message already typed into this person's own WhatsApp — which is
              why it is allowed at all: the template rule governs a business
              opening a conversation programmatically, not a human sending
              from their own number. The wording is the same one the automatic
              sender will use, so nothing about it changes for the customer
              when the API takes over. */}
          {order.manualWhatsapp && (
            <a
              href={order.manualWhatsapp.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                if (order.manualWhatsapp) {
                  void logManualWhatsappAction(order.orderNumber, order.manualWhatsapp.event);
                }
              }}
              className={`mb-3 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold ${
                order.manualWhatsapp.alreadySent
                  ? "border-border text-muted-foreground border"
                  : "bg-success/15 text-success hover:bg-success/25"
              }`}
            >
              <Send className="size-4" />
              {order.manualWhatsapp.alreadySent
                ? "שלח שוב בוואטסאפ"
                : `שלח בוואטסאפ: ${NOTIFY_EVENT_LABELS[order.manualWhatsapp.event]}`}
            </a>
          )}
          {!order.manualWhatsapp && order.customerPhone && (
            <p className="text-muted-foreground mb-3 text-xs">
              מספר הטלפון של הלקוח לא בפורמט שאפשר לפתוח בוואטסאפ.
            </p>
          )}
          {order.notifications.length === 0 ? (
            <p className="text-muted-foreground text-sm">עוד לא נשלחו עדכונים.</p>
          ) : (
            <ul className="flex flex-col gap-1.5 text-sm">
              {order.notifications.map((n, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${
                      n.status === "SENT"
                        ? "bg-success/15 text-success"
                        : n.status === "FAILED"
                          ? "bg-destructive/15 text-destructive"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {NOTIFY_CHANNEL_LABELS[n.channel as NotifyChannel] ?? n.channel}
                  </span>
                  <span className="flex-1">
                    {NOTIFY_EVENT_LABELS[n.event as NotifyEvent] ?? n.event}
                    {n.error && <span className="text-muted-foreground block text-xs">{n.error}</span>}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">{formatDateTime(n.at)}</span>
                </li>
              ))}
            </ul>
          )}
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
