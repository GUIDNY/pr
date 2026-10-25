"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Truck, Store, Phone, Mail, AlertTriangle, Check, Loader2,
  Package, Clock, MessageSquare, CreditCard, Send, Undo2, Trash2, ExternalLink, Eye, TrendingUp,
} from "lucide-react";
import type { SellerOrderDetail } from "@/lib/queries/seller-orders";
import { paymentSignal, SIGNAL_DOT, SIGNAL_CHIP } from "@/lib/order-signal";
import {
  ORDER_STATUS_LABELS,
  MANUAL_PAYMENT_METHODS,
  MANUAL_PAYMENT_METHOD_LABELS,
  paymentMethodLabel,
  type ManualPaymentMethod,
  type OrderStatus,
} from "@/lib/enums";
import { NOTIFY_CHANNEL_LABELS, NOTIFY_EVENT_LABELS } from "@/lib/notify/types";
import { stageOf } from "@/lib/order-stage";
import { formatPrice, formatDateTime } from "@/lib/format";
import { orderProfit } from "@/lib/order-profit";
import {
  approveOrderAction, closeOrderAction, markShippedAction, logManualWhatsappAction,
  undoLastStatusAction, deleteOrderAction, resendNotificationAction, markPaidManuallyAction, trashOrdersAction,
  setDeliveryCostAction,
} from "@/actions/seller-orders";
import { COURIERS } from "@/lib/couriers";
import { describeTouch } from "@/lib/attribution";

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const whatsappAuto = order.readiness.some((c) => c.id === "WHATSAPP" && c.configured);
  const [error, setError] = useState<string | null>(null);
  const [shipOpen, setShipOpen] = useState(false);
  const [courier, setCourier] = useState({ name: "", trackingNumber: "", trackingUrl: "" });
  /* Who is carrying it. "internal" is our own driver: there is no company to
     name and no consignment to track, so the three fields below go away
     rather than sit there inviting a number that does not exist. */
  const [shipMode, setShipMode] = useState<"courier" | "internal">("courier");
  /* Deleting is two clicks, and the second one is the one that is armed. Not
     a confirm() dialog: those are dismissed by muscle memory, and this is the
     only irreversible button on the page. */
  const [confirming, setConfirming] = useState<"idle" | "ready">("idle");
  /* "שולם ידנית": how the customer paid and, optionally, a reference. Not a
     one-click button, because it is the one action on this page that
     invents money — the panel is the second look. */
  const [manualOpen, setManualOpen] = useState(false);
  const [manualMethod, setManualMethod] = useState<ManualPaymentMethod>("PHONE_CARD");
  const [manualRef, setManualRef] = useState("");

  const signal = paymentSignal(order.paymentStatus);
  const stage = stageOf(order.status);
  const blocked = order.problems.some((p) => p.severity === "block");

  function run(action: () => Promise<{ success: boolean; error: string | null }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.success) setError(result.error);
      else {
        setShipOpen(false);
        setManualOpen(false);
      }
    });
  }

  const needsApproval = stage === "open" && (order.paymentStatus === "AUTHORIZED" || order.paymentStatus === "CAPTURED");
  const canShip = stage === "processing" && order.status !== "SHIPPED" && order.paymentStatus === "CAPTURED";
  const canClose = stage === "processing" && order.paymentStatus === "CAPTURED";
  /* The customer paid some other way — over the phone, a transfer, bit,
     cash — and the gateway never heard of it. Offered wherever no payment
     settled: the abandoned-cart tab is where these actually live. */
  const canMarkPaid =
    (stage === "open" || stage === "unpaid") &&
    (order.paymentStatus === "PENDING" || order.paymentStatus === "FAILED") &&
    order.status !== "CANCELLED";

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
          {canMarkPaid && !manualOpen && (
            <button
              type="button"
              disabled={pending}
              onClick={() => setManualOpen(true)}
              className="bg-brand text-brand-foreground hover:bg-brand-hover flex items-center gap-1.5 rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-60"
            >
              <CreditCard className="size-4" /> שולם ידנית
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

        {manualOpen && (
          <div className="border-border mt-3 flex flex-col gap-3 rounded-xl border p-3">
            <p className="text-sm font-bold">איך הלקוח שילם {formatPrice(order.total)}?</p>
            <div className="flex flex-wrap gap-2">
              {MANUAL_PAYMENT_METHODS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setManualMethod(m)}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    manualMethod === m ? "border-brand bg-brand/10 font-bold" : "border-border hover:bg-muted"
                  }`}
                >
                  {MANUAL_PAYMENT_METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            <input
              value={manualRef}
              onChange={(e) => setManualRef(e.target.value)}
              placeholder="אסמכתא (אופציונלי): מספר אישור, מספר העברה…"
              className="border-input h-9 rounded-lg border px-3 text-sm"
              maxLength={80}
            />
            <p className="text-muted-foreground text-xs">
              ההזמנה תסומן כשולמה במלואה, תעבור לטיפול והלקוח יקבל הודעה שהתשלום אושר — בדיוק כמו אחרי גביית
              דפוזיט.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(() => markPaidManuallyAction(order.orderNumber, { method: manualMethod, reference: manualRef }))
                }
                className="bg-brand text-brand-foreground hover:bg-brand-hover flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                אשר — התקבל תשלום של {formatPrice(order.total)}
              </button>
              <button type="button" onClick={() => setManualOpen(false)} className="border-border rounded-lg border px-4 py-2 text-sm">
                ביטול
              </button>
            </div>
          </div>
        )}

        {shipOpen && (
          <div className="border-border mt-3 flex flex-col gap-2 rounded-xl border p-3">
            <p className="text-sm font-bold">פרטי המשלוח</p>
            {/* The choice first, because it decides what the rest of the form
                even asks for — and because picking it after typing a courier
                is how a tracking number ends up on a delivery that has none. */}
            <div className="flex gap-2">
              {(
                [
                  { id: "courier", label: "חברת שליחויות" },
                  { id: "internal", label: "משלוח פנימי (שליח שלנו)" },
                ] as const
              ).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setShipMode(option.id)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-bold ${
                    shipMode === option.id
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {shipMode === "courier" ? (
              <>
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
              </>
            ) : (
              /* Says what the customer will be told, because that is the part
                 of this choice that is not obvious from its name. */
              <p className="text-muted-foreground bg-muted/50 rounded-lg px-3 py-2 text-xs leading-relaxed">
                ההזמנה יוצאת עם שליח שלנו. הלקוח יקבל הודעה שההזמנה יצאה אליו ושניצור קשר לתיאום
                המסירה — בלי מספר מעקב ובלי קישור מעקב, כי אין לנו כאלה.
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={pending || (shipMode === "courier" && !courier.name.trim())}
                onClick={() =>
                  run(() =>
                    markShippedAction(order.orderNumber, {
                      ...courier,
                      internal: shipMode === "internal",
                    }),
                  )
                }
                className="bg-brand text-brand-foreground rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
              >
                {pending ? "שומר…" : "אשר יציאה למשלוח"}
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

      {/* items-start, which is most of what was wrong with this page. A grid
          cell stretches its child by default, so every panel was as tall as
          whatever happened to sit beside it: four courier links in a box the
          height of the whole updates panel, and a one-line order showing a
          "פריטים" box with 200px of white under it. Each panel is its own
          height now and the page stops looking half-empty. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
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
          {/* Where the customer came from. Two lines when the visit that
              brought them and the click before the order differ — a Google
              search in May and a Facebook ad today are both worth knowing. */}
          <Field label="מקור ההגעה">
            {order.attribution ? (
              <div className="flex flex-col gap-0.5">
                <span>
                  {describeTouch(order.attribution.first)}
                  <span className="text-muted-foreground text-xs">
                    {" "}· {formatDateTime(new Date(order.attribution.first.at))}
                    {order.attribution.first.landing && (
                      <>
                        {" "}· נחת/ה ב‑<span dir="ltr" className="break-all">{order.attribution.first.landing}</span>
                      </>
                    )}
                  </span>
                </span>
                {order.attribution.last && describeTouch(order.attribution.last) !== describeTouch(order.attribution.first) && (
                  <span className="text-muted-foreground text-xs">
                    לפני ההזמנה: {describeTouch(order.attribution.last)} · {formatDateTime(new Date(order.attribution.last.at))}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-muted-foreground">לא נרשם (הזמנה מלפני שהאתר התחיל לשמור את זה)</span>
            )}
          </Field>
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
          <Field label="אמצעי תשלום">{paymentMethodLabel(order.paymentMethod)}</Field>
          {order.paid ? (
            <>
              <Field label={order.paymentStatus === "AUTHORIZED" ? "נתפס בכרטיס" : "נגבה בפועל"}>
                {formatPrice(order.paid.heldAmount ?? order.paid.amount)}
              </Field>
              {/* The card, as the customer knows it. The callback has stored
                  these since the gateway went in and nothing displayed them,
                  so the back office had a gateway reference — meaningless to
                  the person on the other end of the phone — and nothing to
                  say when somebody asks which card was charged. */}
              {order.paid.cardLast4 && (
                <Field label="כרטיס">
                  <span dir="ltr">**** {order.paid.cardLast4}</span>
                  {order.paid.clearerName ? ` · ${order.paid.clearerName}` : ""}
                  {/* The expiry, for the day a hold lapses and the card has
                      to be charged again — the one detail the phone call
                      otherwise has to ask for. */}
                  {order.paid.cardExpiry ? (
                    <>
                      {" · תוקף "}
                      <span dir="ltr">{order.paid.cardExpiry}</span>
                    </>
                  ) : null}
                </Field>
              )}
              {order.paid.approvalNo && <Field label="מספר אישור">{order.paid.approvalNo}</Field>}
              {order.paid.capturedAt && <Field label="מועד גבייה">{formatDateTime(order.paid.capturedAt)}</Field>}
            </>
          ) : (
            <Field label="תשלום">עוד לא נפתח</Field>
          )}
        </Panel>

        <ProfitPanel order={order} />

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
        {/* Couriers and history finish the grid as a pair: both are short,
           both are reference rather than action, and an odd number of panels
           in two columns always leaves one of them beside a hole. */}
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
          <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
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
        <Panel title="היסטוריה" icon={Clock}>
          <ul className="flex flex-col gap-2 text-sm">
            {/* One line per step, with the time in a column of its own. The
                three-line block per entry made a short history look like a long
                one, and the dates could not be compared down the page because
                they each started at a different place. */}
            {order.history.map((h, i) => (
              <li key={i} className="border-border flex flex-wrap items-baseline gap-x-2 border-s-2 ps-3">
                <span className="font-semibold">{ORDER_STATUS_LABELS[h.to as OrderStatus] ?? h.to}</span>
                {h.by && <span className="text-muted-foreground text-xs">{h.by}</span>}
                <span className="text-muted-foreground ms-auto text-xs tabular-nums">{formatDateTime(h.at)}</span>
                {h.note && <span className="text-muted-foreground w-full text-xs">{h.note}</span>}
              </li>
            ))}
          </ul>
        </Panel>

      </div>

      {/* ---- the one panel worth the full width ----
           It holds the only buttons on the page that reach a customer, and
           every row in it is a label, three channel chips and two actions —
           which wrapped onto three lines inside half a page. */}
        <Panel title="עדכונים ללקוח" icon={MessageSquare}>
          {/* What can send right now. The rows below are a log — each one
              records what was true at the moment it was sent, and a message
              that failed last week keeps saying so after the account is
              connected. Without this line the panel reads as broken long
              after it is fixed. */}
          <div className="border-border -mt-1 mb-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed p-2 text-xs">
            <span className="text-muted-foreground">כרגע:</span>
            {order.readiness.map((channel) => (
              <span
                key={channel.id}
                title={channel.missing.join(", ")}
                className={`rounded px-1.5 py-0.5 font-bold ${
                  channel.configured
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {NOTIFY_CHANNEL_LABELS[channel.id]} {channel.configured ? "פעיל" : "לא מחובר"}
              </span>
            ))}
            <span className="text-muted-foreground w-full">
              {/* What the shop promises a customer, in the one place a
                  salesperson reads before pressing. Nothing below the order
                  confirmation goes out on its own any more — see the note on
                  approveOrderAction — so the panel has to say so, or someone
                  marks an order shipped and assumes the customer was told. */}
              <strong className="text-foreground">שום עדכון לא נשלח מעצמו.</strong>{" "}
              מלבד אישור ההזמנה, שנשלח ללקוח ברגע שהזמין, כל הודעה כאן יוצאת רק כשלוחצים עליה.{" "}
              {order.readiness.find((c) => c.id === "WHATSAPP")?.configured
                ? 'לחיצה על "שלח" מוציאה מייל ווואטסאפ יחד, דרך ה-API של Meta. "וואטסאפ ידני" פותח את ההודעה אצלך, לגיבוי בלבד.'
                : "וואטסאפ נפתח אצלך מוכן לשליחה עד שמטא מאשרים את התבניות."}
            </span>
          </div>
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
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {update.due && (
                    <>
                      {/* One button sends again on every connected channel —
                          the API does the WhatsApp when it is connected. The
                          wa.me link is the by-hand fallback, and it is named
                          so once the API is on, because the two were being
                          mistaken for each other. */}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => resendNotificationAction(order.orderNumber, update.event))}
                        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-bold disabled:opacity-50 ${
                          whatsappAuto ? "bg-success/15 text-success hover:bg-success/25" : "border-border hover:bg-muted border font-semibold"
                        }`}
                      >
                        {whatsappAuto ? <Send className="size-3.5" /> : <Mail className="size-3.5" />}
                        {/* "שוב" only when it really is again: nothing is sent
                            automatically any more, so the first press on most
                            of these is the first time the customer hears. */}
                        {update.channels.some((c) => c.status === "SENT") ? "שלח שוב" : "שלח"}
                        {whatsappAuto ? " (מייל + וואטסאפ)" : " מייל"}
                      </button>
                      {update.whatsappHref && (
                        <a
                          href={update.whatsappHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void logManualWhatsappAction(order.orderNumber, update.event)}
                          className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs ${
                            whatsappAuto
                              ? "border-border text-muted-foreground hover:text-foreground border font-semibold"
                              : "bg-success/15 text-success hover:bg-success/25 font-bold"
                          }`}
                        >
                          <Send className="size-3.5" /> {whatsappAuto ? "וואטסאפ ידני" : "שלח וואטסאפ"}
                        </a>
                      )}
                    </>
                  )}
                  {/* Also on the messages this order has not reached yet —
                      seeing what the customer will be sent is the whole
                      reason to look before pressing anything. */}
                  <a
                    href={`/admin/orders/${order.orderNumber}/email/${update.event}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-1 py-1 text-xs font-semibold underline underline-offset-2"
                  >
                    <Eye className="size-3.5" /> תצוגה מקדימה
                  </a>
                </div>
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
      {/* ---- the exit for something that should not exist ---- */}
      <div className="border-border mt-2 rounded-2xl border border-dashed p-4">
        <p className="text-muted-foreground text-xs">
          {order.removal.reason ??
            "העברה לפח מוציאה את ההזמנה מכל הרשימות ואפשר לשחזר אותה. מחיקה לצמיתות מוחקת אותה לגמרי ומיועדת להזמנות בדיקה ולטעויות שלא נגבה בהן כסף."}
        </p>
        {/* The bin, from the page itself: it used to be reachable only by
            ticking a row in the list, and a person standing on a cancelled
            order who wants it gone should not have to go and find it. */}
        {order.removal.canBin && !order.deletedAt && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(async () => {
                const result = await trashOrdersAction([order.orderNumber]);
                if (result.success) router.push("/admin/orders");
                return result;
              })
            }
            className="border-border hover:bg-muted mt-2 flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <Trash2 className="size-4" /> העבר לפח
          </button>
        )}
        {order.removal.canPurge && (
          <button
            type="button"
            disabled={pending || confirming !== "ready"}
            onClick={() => run(() => deleteOrderAction(order.orderNumber))}
            className="text-destructive hover:bg-destructive/10 mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
          >
            <Trash2 className="size-4" /> מחק את ההזמנה לצמיתות
          </button>
        )}
        {order.removal.canPurge && confirming !== "ready" && (
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

/**
 * What this order made, and the one number only a person can supply.
 *
 * The arithmetic is lib/order-profit.ts, which keeps the rule the dashboard
 * already used: the goods' price less the discount less what those goods cost
 * us on the day, from the snapshots on the line and never from today's price
 * list. Delivery is the part the dashboard leaves out and this cannot — a
 * customer who paid nothing for delivery on an order the courier charged ₪120
 * for is a different order from one collected at the branch, and that is
 * exactly the difference a shopkeeper is looking for here.
 *
 * It says what it does not know. A product with no cost on record makes the
 * profit an upper bound rather than a figure, and so does a delivery cost
 * nobody has typed in; in either case the number is labelled "לכל היותר"
 * rather than presented as the answer. Treating a missing cost as zero would
 * read as a 100% margin, and nothing on the screen would correct it.
 */
function ProfitPanel({ order }: { order: SellerOrderDetail }) {
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState(order.deliveryCost === null ? "" : String(order.deliveryCost));
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  const p = orderProfit({
    lines: order.items.map((i) => ({ priceSnap: i.price, costSnap: i.cost, quantity: i.quantity })),
    discount: order.discountTotal,
    deliveryIncome: order.delivery.fee,
    deliveryCost: order.deliveryCost,
  });

  const save = () =>
    startTransition(async () => {
      const result = await setDeliveryCostAction(order.orderNumber, draft);
      if (result.success) {
        setSaved(true);
        router.refresh();
      }
    });

  return (
    <Panel title="רווח" icon={TrendingUp}>
      <Field label="נמכר ב">{formatPrice(p.revenue)}</Field>
      {p.discount > 0 && <Field label="הנחה">−{formatPrice(p.discount)}</Field>}
      {p.deliveryIncome > 0 && <Field label="משלוח שהלקוח שילם">{formatPrice(p.deliveryIncome)}</Field>}
      <Field label="עלות הסחורה">−{formatPrice(p.goodsCost)}</Field>

      <div className="flex items-baseline gap-2 text-sm">
        <span className="text-muted-foreground w-28 shrink-0">עלות משלוח</span>
        <span className="flex items-center gap-1.5">
          <input
            type="number"
            min="0"
            step="1"
            inputMode="decimal"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setSaved(false);
            }}
            placeholder="לא הוזן"
            aria-label="עלות המשלוח בפועל"
            className="border-border w-24 rounded-md border px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground">₪</span>
          <button
            type="button"
            onClick={save}
            disabled={pending || draft === (order.deliveryCost === null ? "" : String(order.deliveryCost))}
            className="border-border rounded-md border px-2 py-1 text-xs font-bold disabled:opacity-40"
          >
            {pending ? "שומר…" : saved ? "נשמר" : "שמור"}
          </button>
        </span>
      </div>

      <div className="border-border mt-1 border-t pt-2">
        {/* The one number the panel exists for, at the size of the one number
            the panel exists for. Everything above it is the working. */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-muted-foreground text-sm">{p.certain ? "רווח" : "רווח — לכל היותר"}</span>
          <span className="flex items-baseline gap-2">
            <span className={`text-2xl font-black ${p.profit >= 0 ? "text-success" : "text-destructive"}`}>
              {formatPrice(p.profit)}
            </span>
            {p.margin !== null && (
              <span className="text-muted-foreground text-sm tabular-nums">{Math.round(p.margin * 100)}%</span>
            )}
          </span>
        </div>
      </div>

      {/* Everything the number leaves out, where the number is. A margin that
          quietly omits the clearing fee is one somebody prices against. */}
      <p className="text-muted-foreground mt-1 text-xs">
        {p.linesMissingCost > 0 && (
          <span className="text-warning-foreground block font-semibold">
            {p.linesMissingCost === 1 ? "לפריט אחד אין עלות רשומה" : `ל־${p.linesMissingCost} פריטים אין עלות רשומה`} — הרווח
            האמיתי נמוך יותר.
          </span>
        )}
        {order.deliveryCost === null && <span className="block">עלות המשלוח עוד לא הוזנה.</span>}
        לפני עמלת סליקה ולפני מע״מ על הרווח.
      </p>
    </Panel>
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