import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { emailChannel } from "./channels";
import { teamAlertRecipients } from "./owner-alert";

/**
 * Telling the shop that a payment did not go through.
 *
 * A successful payment has sent a "handle this order" mail to
 * TEAM_ALERT_EMAIL for as long as there has been one. A failed payment sent
 * nothing at all: the order took `PAYMENT_FAILED` and died quietly, with
 * the customer's name, phone, email and address sitting in the row.
 *
 * Two of those were found by hand. PR-462763 was refused by the issuer at
 * 19:07 on 20 October for ₪650 and nobody knew for two days; PR-634879
 * never reached Pelecard at all on 10 October, ₪3,800, and was still
 * untouched twelve days later. Both had a phone number on them the whole
 * time.
 *
 * So: two triggers, one mail, and a bot filter that decides whether the
 * whole thing is worth reading.
 */

/* Shva's refusal codes, in the words of somebody who has to telephone a
   customer about it. "transaction refused." is what the gateway says and
   it tells the reader nothing. 004 is worth knowing in particular: the
   issuer declines without giving a reason, and in practice it is usually
   the credit limit — which is a sale that instalments or a second card
   recovers, not a lost one. */
export const DECLINE_REASONS: Record<string, { short: string; say: string }> = {
  "004": { short: "הבנק המנפיק סירב", say: "אין סיבה מפורטת, ובפועל לרוב חריגה ממסגרת — להציע כרטיס אחר או פריסה לתשלומים" },
  "033": { short: "כרטיס לא תקין", say: "כרטיס אחר" },
  "036": { short: "תוקף הכרטיס פג", say: "כרטיס אחר" },
  "051": { short: "אין כיסוי", say: "כרטיס אחר או פריסה לתשלומים" },
  "650": { short: "אימות מול הבנק לא הושלם", say: "לנסות שוב, או סליקה טלפונית" },
};

/* The short form is what already sits in the abandoned-cart notes, so the
   wording stays what it was: a field a person reads should not silently
   change its phrasing under them. An unknown code prints bare rather than
   being guessed at. */
export function declineText(code: string | null | undefined): string {
  if (!code) return "לא התקבל קוד מהסולק";
  const known = DECLINE_REASONS[code];
  return known ? `קוד ${code} · ${known.short}` : `קוד ${code}`;
}

/**
 * Is this order a crawler's and not a customer's?
 *
 * Google's Storebot walks the whole purchase flow to check that the shop
 * matches its Merchant Center feed, and it does so by **creating real rows
 * in `Order`** — five of the eight orders sitting in `PAYMENT_PENDING` are
 * its, all between 01:00 and 02:00. Without this filter the owner gets a
 * false alarm every night, stops reading them inside a week, and the one
 * that matters arrives into a folder nobody opens. The filter is the
 * feature.
 *
 * Measured against those five rows rather than guessed: every one carries
 * `Plonial Moni` and an `@storebotmail.joonix.net` address.
 *
 * It is a stopgap and it is brittle on purpose-built strings — the day
 * Google changes that address the rubbish comes back. The durable version
 * is an `isBot` column stamped from the User-Agent when the order is
 * created, which `PageView` and `VisitEvent` already do and `Order` does
 * not.
 *
 * Storebot itself is left alone in robots.txt: it is part of Merchant
 * Center's own quality checks, and blocking it there would cost the feed.
 * It is filtered out of the alerts, not off the site.
 */
const BOT_EMAIL = /storebot|@joonix\.net/i;
const BOT_NAMES = new Set(["plonial moni"]);
/* Internal addresses that place real orders on purpose. bd12123 is the
   fallback recipient of this very mail — alerting ourselves about our own
   test is noise with a loop in it. */
const INTERNAL_EMAIL = /^bd12123@gmail\.com$/i;

export function isBotOrder(order: { guestName: string | null; guestEmail: string | null }): boolean {
  const email = order.guestEmail?.trim() ?? "";
  if (email && (BOT_EMAIL.test(email) || INTERNAL_EMAIL.test(email))) return true;
  const name = order.guestName?.trim().toLowerCase() ?? "";
  return name.length > 0 && BOT_NAMES.has(name);
}

const SELECT = {
  id: true,
  orderNumber: true,
  total: true,
  status: true,
  createdAt: true,
  guestName: true,
  guestEmail: true,
  guestPhone: true,
  shipCity: true,
  shipStreet: true,
  shipHouseNo: true,
  whatsappOptIn: true,
  attribution: true,
  user: { select: { name: true, email: true, phone: true } },
  items: { select: { titleSnap: true, skuSnap: true, quantity: true } },
  payments: {
    orderBy: { createdAt: "desc" as const },
    take: 1,
    select: { pelecardStatusCode: true, cardLast4: true, clearerName: true, rawResponse: true },
  },
} as const;

type AlertablePayment = {
  pelecardStatusCode: string | null;
  cardLast4: string | null;
  clearerName: string | null;
  rawResponse: unknown;
};
type AlertableOrder = {
  id: string;
  orderNumber: string;
  total: number;
  status: string;
  createdAt: Date;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  shipCity: string | null;
  shipStreet: string | null;
  shipHouseNo: string | null;
  whatsappOptIn: boolean | null;
  attribution: unknown;
  user: { name: string | null; email: string | null; phone: string | null } | null;
  items: { titleSnap: string; skuSnap: string | null; quantity: number }[];
  payments: AlertablePayment[];
};

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Israel time, because the reader is in Israel and the column is UTC. */
function whenIL(at: Date): string {
  return new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

function money(total: number): string {
  return `${total.toLocaleString("he-IL")} ₪`;
}

/** The dialable form, for a tel: link that works from a phone's lock screen. */
function dial(phone: string): string {
  return phone.replace(/[^\d+]/g, "");
}

function pick<T>(value: unknown, path: string[]): T | null {
  let cursor: unknown = value;
  for (const key of path) {
    if (cursor === null || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return (cursor ?? null) as T | null;
}

type Flavour = "FAILED" | "STUCK";

export function renderPaymentAlert(order: AlertableOrder, flavour: Flavour): { subject: string; html: string; text: string } {
  const name = order.guestName?.trim() || order.user?.name?.trim() || "לקוח ללא שם";
  const phone = order.guestPhone?.trim() || order.user?.phone?.trim() || null;
  const email = order.guestEmail?.trim() || order.user?.email?.trim() || null;
  const payment = order.payments[0] ?? null;
  const feedback = payment ? pick<Record<string, unknown>>(payment.rawResponse, ["feedback"]) : null;
  const result = feedback ? pick<Record<string, unknown>>(feedback, ["ResultData"]) : null;

  const headline = flavour === "FAILED" ? "כישלון תשלום" : "תשלום תקוע 45 דק'";
  /* Amount and phone in the subject on purpose: the owner reads this on a
     lock screen and can act without opening anything. */
  const subject = [headline, money(order.total), name, phone].filter(Boolean).join(" · ");

  const why =
    flavour === "FAILED"
      ? declineText(payment?.pelecardStatusCode)
      : "ההזמנה נפתחה ושום תשובה לא חזרה משער הסליקה";
  const advice = flavour === "FAILED" ? DECLINE_REASONS[payment?.pelecardStatusCode ?? ""]?.say ?? null : null;

  const method = (result?.["RecordSourceDescription"] as string | undefined)?.trim() || null;
  const card = [result?.["CardHebrewName"] as string | undefined, payment?.cardLast4 ? `•${payment.cardLast4}` : null]
    .filter(Boolean)
    .join(" ");
  const firstSource = pick<string>(order.attribution, ["first", "source"]);
  const lastSource = pick<string>(order.attribution, ["last", "source"]);
  const landing = pick<string>(order.attribution, ["last", "landing"]);
  const address = [order.shipStreet, order.shipHouseNo, order.shipCity].filter(Boolean).join(" ");
  const orderUrl = `${SITE_URL}/admin/orders/${order.orderNumber}`;

  const rows: [string, string][] = [
    ["הזמנה", esc(order.orderNumber)],
    ["מועד", esc(whenIL(order.createdAt))],
    ["סכום", esc(money(order.total))],
    ["לקוח", esc(name)],
  ];
  if (phone) rows.push(["טלפון", `<a href="tel:${esc(dial(phone))}" style="color:#f55305;font-weight:700;">${esc(phone)}</a>`]);
  if (email) rows.push(["מייל", `<a href="mailto:${esc(email)}" style="color:#f55305;">${esc(email)}</a>`]);
  rows.push(["מה קרה", esc(why)]);
  if (advice) rows.push(["מה להציע", esc(advice)]);
  if (method) rows.push(["אמצעי", esc(method)]);
  if (card) rows.push(["כרטיס", esc(card)]);
  if (address) rows.push(["כתובת", esc(address)]);
  rows.push(["וואטסאפ", order.whatsappOptIn ? "אישר — מותר לכתוב" : "לא אישר — טלפון בלבד"]);
  /* Missing attribution must never stop the mail: an order placed before
     the tracking existed, or by somebody with cookies off, is exactly the
     order worth chasing. */
  rows.push(["מקור", esc([firstSource, lastSource].filter(Boolean).join(" → ") || "לא ידוע")]);
  if (landing) rows.push(["דף נחיתה", esc(landing)]);

  const items = order.items
    .map((item) => `<li>${esc(item.titleSnap)}${item.quantity > 1 ? ` × ${item.quantity}` : ""}${item.skuSnap ? ` <span style="color:#6b7280;">(${esc(item.skuSnap)})</span>` : ""}</li>`)
    .join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(subject)}</title></head>
<body dir="rtl" style="margin:0;padding:0;background:#f5f4f2;direction:rtl;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f4f2;direction:rtl;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" dir="rtl" width="560" cellpadding="0" cellspacing="0" border="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;text-align:right;">
  <tr><td style="background:#b42318;padding:20px 24px;">
    <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);padding-bottom:4px;">Buy Today · התראה פנימית</div>
    <div style="font-size:22px;font-weight:700;color:#ffffff;">${esc(headline)} · ${esc(money(order.total))}</div>
  </td></tr>
  <tr><td style="padding:18px 24px 0;font-size:15px;color:#1f2328;line-height:1.6;">
    ${phone ? `הלקוח השאיר טלפון. אפשר להתקשר עכשיו.` : `אין טלפון על ההזמנה — יש מייל בלבד.`}
    <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;">
      ${rows.map(([label, value]) => `<tr><td style="padding:5px 0;font-size:13px;color:#6b7280;width:88px;">${esc(label)}</td><td style="padding:5px 0;font-size:14px;color:#1f2328;">${value}</td></tr>`).join("")}
    </table>
    ${items ? `<div style="margin-top:14px;font-size:13px;color:#6b7280;">מה ניסה לקנות</div><ul style="margin:6px 0 0;padding-inline-start:18px;font-size:14px;color:#1f2328;line-height:1.7;">${items}</ul>` : ""}
  </td></tr>
  <tr><td style="padding:18px 24px 24px;">
    <a href="${esc(orderUrl)}" style="display:inline-block;background:#f55305;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none;padding:11px 22px;border-radius:9px;">פתיחת ההזמנה</a>
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `${headline} · ${money(order.total)}`,
    `${name}${phone ? ` · ${phone}` : ""}${email ? ` · ${email}` : ""}`,
    `הזמנה ${order.orderNumber} · ${whenIL(order.createdAt)}`,
    why,
    advice ? `מה להציע: ${advice}` : null,
    order.items.map((i) => `· ${i.titleSnap}${i.quantity > 1 ? ` × ${i.quantity}` : ""}`).join("\n"),
    orderUrl,
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}

/**
 * Send once, ever, per order per flavour.
 *
 * `OrderNotification` is unique on (orderId, channel, event), so the insert
 * is the lock: a second cron pass over the same order loses the race on the
 * constraint and returns. No new column, and the same idiom the owner push
 * already uses.
 */
async function sendOnce(order: AlertableOrder, flavour: Flavour, recipients: string[]): Promise<boolean> {
  const event = flavour === "FAILED" ? "PAYMENT_FAILED_ALERT" : "PAYMENT_STUCK_ALERT";
  try {
    await db.orderNotification.create({
      data: { orderId: order.id, channel: "EMAIL", event, recipient: recipients.join(",") },
    });
  } catch {
    return false; // already sent, or already being sent
  }
  const { subject, html, text } = renderPaymentAlert(order, flavour);
  const results = await Promise.all(
    recipients.map((to) => emailChannel.send(to, { subject, body: text, html }).catch(() => null)),
  );
  const ok = results.some((r) => r !== null);
  await db.orderNotification.updateMany({
    where: { orderId: order.id, channel: "EMAIL", event },
    data: ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: "send failed" },
  });
  return ok;
}

/**
 * Trigger A — the card was refused, and we know within seconds.
 *
 * Called from the Pelecard callback on the same pass that moves the order
 * to PAYMENT_FAILED. Immediate and not queued: it is worth thousands and a
 * person should see it in minutes.
 *
 * Never throws. It runs after the customer already has their answer, and
 * an alert that fails must not turn into a payment that fails.
 */
export async function notifyPaymentFailed(orderId: string): Promise<void> {
  try {
    const recipients = teamAlertRecipients();
    if (recipients.length === 0 || !emailChannel.configured()) return;
    const order = (await db.order.findUnique({ where: { id: orderId }, select: SELECT })) as AlertableOrder | null;
    if (!order || isBotOrder(order)) return;
    await sendOnce(order, "FAILED", recipients);
  } catch (error) {
    console.error("[payment-alert] could not report the failed payment", { orderId, error });
  }
}

/** How long a customer may plausibly still be at the gateway. */
export const STUCK_AFTER_MINUTES = 45;

/**
 * Trigger B — the order was opened and the gateway never answered.
 *
 * This is the one that cost the most and carries no error code at all,
 * because nothing came back to carry one: `rawResponse` and
 * `pelecardTransactionId` are both empty, which together mean the customer
 * started and we never heard another word.
 *
 * 45 minutes rather than 10, because a customer who goes to check their
 * credit limit and comes back is a real sequence, and an alert about
 * somebody still mid-purchase trains the reader to ignore it.
 */
export async function alertStuckPayments(now: Date = new Date()): Promise<{ scanned: number; sent: number; skipped: number }> {
  const cutoff = new Date(now.getTime() - STUCK_AFTER_MINUTES * 60_000);
  const recipients = teamAlertRecipients();
  if (recipients.length === 0 || !emailChannel.configured()) return { scanned: 0, sent: 0, skipped: 0 };

  const candidates = (await db.order.findMany({
    where: {
      status: "PAYMENT_PENDING",
      createdAt: { lt: cutoff },
      notifications: { none: { channel: "EMAIL", event: "PAYMENT_STUCK_ALERT" } },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: SELECT,
  })) as AlertableOrder[];

  let sent = 0;
  let skipped = 0;
  for (const order of candidates) {
    if (isBotOrder(order)) {
      skipped++;
      continue;
    }
    const payment = order.payments[0] ?? null;
    /* Nothing came back. A payment row that has a transaction id or a
       stored response did get an answer, and whatever that answer was it
       is not this trigger's business. No payment row at all is the same
       silence by another route. */
    if (payment && (payment.rawResponse !== null || payment.pelecardStatusCode !== null)) {
      skipped++;
      continue;
    }
    /* The customer came back and tried again. מיכל רצהבי opened PR-441179
       at 17:45 and PR-941179's successor ten minutes later, which was
       refused with a 650 — trigger A has already reported that one, and
       the abandoned first attempt is not a second thing to telephone her
       about. Matched on whichever contact detail the order carries. */
    const laterAttempt = await db.order.findFirst({
      where: {
        id: { not: order.id },
        createdAt: { gt: order.createdAt },
        OR: [
          order.guestEmail ? { guestEmail: { equals: order.guestEmail, mode: "insensitive" as const } } : {},
          order.guestPhone ? { guestPhone: order.guestPhone } : {},
        ].filter((clause) => Object.keys(clause).length > 0),
      },
      select: { id: true },
    });
    if (laterAttempt) {
      skipped++;
      continue;
    }
    if (await sendOnce(order, "STUCK", recipients)) sent++;
  }
  return { scanned: candidates.length, sent, skipped };
}
