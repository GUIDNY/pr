import "server-only";
import { db } from "@/lib/db";
import { formatPrice } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";
import { emailChannel } from "./channels";

/**
 * "הזמנה חדשה" — the mail that goes to the shop, not to the customer.
 *
 * Deliberately not a fifth NotifyEvent. The four in types.ts are the four
 * things a customer is told, they are what the order page's updates panel
 * lists, and each has a resend button beside it. This one is addressed to a
 * different person, says different things — the phone number to ring, the
 * lane the money came in on, a link straight into the back office — and
 * nobody should be resending it to a customer by pressing the wrong row.
 *
 * It does share the log table, under its own event name, and that is what
 * makes it send once. An order that is created and then confirmed by a
 * gateway callback passes through here twice; the unique index on
 * (orderId, channel, event) is what turns the second one into a no-op,
 * rather than a check on order status that would have to know about every
 * lane.
 */

const OWNER_EVENT = "OWNER_NEW_ORDER";

/**
 * Who gets told.
 *
 * The shop owner by default, so the alert works the moment this deploys with
 * nothing to configure. OWNER_ALERT_EMAIL overrides it — a different address,
 * or several separated by commas — which is what makes adding a second person
 * a dashboard change rather than a deploy.
 *
 * Set to empty and the alert is off. That is deliberate: turning it off
 * should be something somebody chose, not something a missing variable did
 * quietly.
 */
const OWNER_DEFAULT = "aiasafidan@gmail.com";

export function ownerAlertRecipients(): string[] {
  const raw = process.env.OWNER_ALERT_EMAIL ?? OWNER_DEFAULT;
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
const BRAND = "#f55305";
const INK = "#1f2328";
const MUTED = "#6b7280";
const LINE = "#ececf1";
const PAGE = "#f5f4f2";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** One labelled fact. The label is narrow so the values line up down the page. */
function fact(label: string, value: string, href?: string) {
  const inner = href
    ? `<a href="${esc(href)}" style="color:${BRAND};text-decoration:none;font-weight:700;">${esc(value)}</a>`
    : esc(value);
  return `<tr>
    <td align="right" valign="top" width="110" style="text-align:right;padding:7px 0;font-family:${FONT};font-size:13px;color:${MUTED};white-space:nowrap;">${esc(label)}</td>
    <td align="right" valign="top" style="text-align:right;padding:7px 0 7px 0;font-family:${FONT};font-size:14px;color:${INK};font-weight:600;line-height:1.5;">${inner}</td>
  </tr>`;
}

export type AlertOrder = {
  orderNumber: string;
  total: number;
  paymentStatus: string;
  paymentMethod: string | null;
  deliveryMethod: string;
  customerNote: string | null;
  shipCity: string | null;
  shipStreet: string | null;
  shipHouseNo: string | null;
  shipApartment: string | null;
  guestName: string | null;
  guestEmail: string | null;
  guestPhone: string | null;
  user: { name: string; email: string; phone: string | null } | null;
  items: { titleSnap: string; skuSnap: string; quantity: number; priceSnap: number }[];
};

/* The customer's words, in the shop's language. The alert exists to be acted
   on, so it says "דפוזיט — צריך לאשר" rather than AUTHORIZED. */
const PAYMENT_TEXT: Record<string, string> = {
  CAPTURED: "שולם במלואו",
  AUTHORIZED: "דפוזיט — נתפס בכרטיס, צריך לאשר",
  PENDING: "עוד לא שולם",
  FAILED: "התשלום נכשל",
  REFUNDED: "זוכה",
};

/**
 * The push to the owner's phone — the Notify! app (getnotifyapp.com).
 *
 * OWNER_PUSH_URL is the group's send URL exactly as the app hands it out,
 * token included: https://push.getnotifyapp.com/notify-group/GRP…?token=…
 * The token is a secret, so the whole URL lives in Vercel and nowhere else.
 * Unset, and there is no push — the mail still goes.
 *
 * A GET with query parameters, because that is what the service reads; a
 * form body answers "Missing body parameter".
 */
export function ownerPushConfigured(): boolean {
  return !!process.env.OWNER_PUSH_URL?.trim();
}

/** The two lines that fit on a lock screen. */
export function renderOwnerPush(order: AlertOrder): { title: string; body: string } {
  const name = order.user?.name ?? order.guestName ?? "לקוח ללא שם";
  const phone = order.guestPhone ?? order.user?.phone ?? null;
  const toCustomer = order.deliveryMethod === "DELIVERY";
  const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const first = order.items[0]?.titleSnap ?? "";
  const what = count > 1 ? `${first} ועוד ${count - 1}` : first;
  return {
    title: `הזמנה חדשה · ${formatPrice(order.total)}`,
    body: [
      name + (phone ? ` · ${phone}` : ""),
      PAYMENT_TEXT[order.paymentStatus] ?? order.paymentStatus,
      toCustomer ? `משלוח${order.shipCity ? ` ל${order.shipCity}` : ""}` : "איסוף עצמי",
      what,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

async function sendOwnerPush(order: AlertOrder): Promise<{ ok: true } | { ok: false; error: string }> {
  const { title, body } = renderOwnerPush(order);
  /* One thread on the phone for all of the shop's orders, so they stack
     rather than scatter between other apps' alerts. */
  return pushToOwnerDevices(title, body, "buytoday-orders");
}

/**
 * The push itself, with nothing about orders in it.
 *
 * Separated out when complaints needed the same phone: the service, the
 * token, the timeout and the three ways a 200 still means "nobody got it"
 * are properties of the channel, not of what is being announced, and a
 * second copy of them is a second place to fix the day the service changes.
 */
export async function pushToOwnerDevices(
  title: string,
  body: string,
  groupType: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const base = process.env.OWNER_PUSH_URL?.trim();
  if (!base) return { ok: false, error: "OWNER_PUSH_URL is not set" };
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return { ok: false, error: "OWNER_PUSH_URL is not a URL" };
  }
  url.searchParams.set("title", title);
  url.searchParams.set("body", body);
  url.searchParams.set("groupType", groupType);
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: `Notify ${res.status}: ${text.slice(0, 200)}` };
    let parsed: { success?: boolean; deviceCount?: number } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* A 200 that is not JSON is still a send. */
    }
    if (parsed.success === false) return { ok: false, error: `Notify: ${text.slice(0, 200)}` };
    if (parsed.deviceCount === 0) return { ok: false, error: "Notify: the group has no devices" };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "fetch failed" };
  }
}

export function renderOwnerEmail(order: AlertOrder): string {
  const name = order.user?.name ?? order.guestName ?? "לקוח ללא שם";
  const phone = order.guestPhone ?? order.user?.phone ?? null;
  const email = order.user?.email ?? order.guestEmail ?? null;
  const toCustomer = order.deliveryMethod === "DELIVERY";
  const address =
    [order.shipStreet, order.shipHouseNo, order.shipApartment && `דירה ${order.shipApartment}`, order.shipCity]
      .filter(Boolean)
      .join(" ") || null;
  const adminUrl = `${SITE_URL}/admin/orders/${order.orderNumber}`;

  const items = order.items
    .map(
      (item, index) => `<tr>
        <td align="right" style="text-align:right;padding:${index === 0 ? "0" : "11px"} 0 11px;${index === 0 ? "" : `border-top:1px solid ${LINE};`}font-family:${FONT};font-size:14px;color:${INK};line-height:1.5;">
          ${esc(item.titleSnap)}<br><span style="color:${MUTED};font-size:12px;">${esc(item.skuSnap)}${item.quantity > 1 ? ` · כמות ${item.quantity}` : ""}</span>
        </td>
        <td align="left" valign="top" style="text-align:left;padding:${index === 0 ? "0" : "11px"} 0 11px;${index === 0 ? "" : `border-top:1px solid ${LINE};`}font-family:${FONT};font-size:14px;font-weight:600;color:${INK};white-space:nowrap;">
          ${esc(formatPrice(item.priceSnap * item.quantity))}
        </td>
      </tr>`,
    )
    .join("");

  /* dir and text-align are repeated on every element for the same reason as
     in email-html.ts: Gmail drops <html> and grafts the rest into its own
     left-to-right document. */
  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>הזמנה חדשה ${esc(order.orderNumber)}</title></head>
<body dir="rtl" bgcolor="${PAGE}" style="margin:0;padding:0;background:${PAGE};direction:rtl;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(name)} · ${esc(formatPrice(order.total))} · ${esc(PAYMENT_TEXT[order.paymentStatus] ?? order.paymentStatus)}</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};direction:rtl;">
  <tr><td align="center" style="text-align:center;padding:26px 12px;">
    <table role="presentation" dir="rtl" width="560" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;text-align:right;width:560px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(23,47,101,0.07);">

      <tr><td bgcolor="${BRAND}" style="text-align:right;background:${BRAND};background-image:linear-gradient(135deg,#f95c0d 0%,#f34f01 100%);padding:22px 26px;">
        <div style="font-family:${FONT};font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);padding-bottom:5px;">הזמנה חדשה באתר</div>
        <div style="font-family:${FONT};font-size:24px;font-weight:700;color:#ffffff;line-height:1.25;">${esc(order.orderNumber)} · ${esc(formatPrice(order.total))}</div>
      </td></tr>

      <tr><td style="padding:22px 26px 0;">
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;">
          ${fact("לקוח", name)}
          ${phone ? fact("טלפון", phone, `tel:${phone.replace(/[^\d+]/g, "")}`) : fact("טלפון", "אין טלפון — אי אפשר להתקשר")}
          ${email ? fact("מייל", email, `mailto:${email}`) : ""}
          ${fact("תשלום", PAYMENT_TEXT[order.paymentStatus] ?? order.paymentStatus)}
          ${order.paymentMethod ? fact("אמצעי", order.paymentMethod === "PELECARD" ? "כרטיס אשראי (פלאקארד)" : order.paymentMethod === "WALLET" ? "יתרת BuyToday" : order.paymentMethod) : ""}
          ${fact("מסירה", toCustomer ? (address ?? "משלוח — בלי כתובת!") : "איסוף עצמי")}
          ${order.customerNote ? fact("הערה", order.customerNote) : ""}
        </table>
      </td></tr>

      <tr><td style="padding:20px 26px 0;">
        <div style="font-family:${FONT};font-size:12px;font-weight:700;color:${BRAND};padding-bottom:10px;">המוצרים</div>
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;">${items}</table>
      </td></tr>

      <tr><td align="center" style="text-align:center;padding:24px 26px 28px;">
        <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;margin:0 auto;">
          <tr><td align="center" bgcolor="${BRAND}" style="text-align:center;background:${BRAND};background-image:linear-gradient(135deg,#f95c0d 0%,#f34f01 100%);border-radius:12px;">
            <a href="${esc(adminUrl)}" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">פתח את ההזמנה בממשק</a>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

/**
 * "היי צוות PR" — the hand-off mail to the people who process orders.
 *
 * Different from the owner's mail in who reads it and what they need: the
 * owner wants the facts, the team wants to get into the back office and
 * open the order. So this one is a set of steps with links — sign in,
 * the orders screen, this order — and quotes the shared team login, because
 * the team reads it on a phone and will not have it memorised.
 *
 * Only for an order whose money has been taken (a deposit held on the card
 * or a full charge): a pending Pelecard order is not yet anybody's to
 * process, and the demo lane's deposit counts as taken.
 *
 * TEAM_ALERT_EMAIL is who gets it (comma-separated; empty turns it off).
 * TEAM_LOGIN_EMAIL is the account to sign in with, TEAM_LOGIN_PASSWORD its
 * password — kept in Vercel, never in this file; unset, the mail says "the
 * team password" and nothing more.
 */
const TEAM_EVENT = "TEAM_NEW_ORDER";
const TEAM_DEFAULT = "bd12123@gmail.com";
const TEAM_LOGIN_DEFAULT = "pr@buytoday.co.il";

export function teamAlertRecipients(): string[] {
  const raw = process.env.TEAM_ALERT_EMAIL ?? TEAM_DEFAULT;
  return raw
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean);
}

function moneyTaken(paymentStatus: string): boolean {
  return paymentStatus === "AUTHORIZED" || paymentStatus === "CAPTURED";
}

/** One numbered step with a link. */
function step(n: number, text: string, href: string, label: string) {
  return `<tr>
    <td align="right" valign="top" width="34" style="text-align:right;padding:9px 0;">
      <span style="display:inline-block;width:24px;height:24px;line-height:24px;border-radius:12px;background:${BRAND};color:#ffffff;font-family:${FONT};font-size:13px;font-weight:700;text-align:center;">${n}</span>
    </td>
    <td align="right" valign="top" style="text-align:right;padding:9px 0;font-family:${FONT};font-size:14px;color:${INK};line-height:1.6;">
      ${text} <a href="${esc(href)}" style="color:${BRAND};font-weight:700;text-decoration:underline;">${esc(label)}</a>
    </td>
  </tr>`;
}

export function renderTeamEmail(order: AlertOrder): string {
  const name = order.user?.name ?? order.guestName ?? "לקוח ללא שם";
  const phone = order.guestPhone ?? order.user?.phone ?? null;
  const loginEmail = process.env.TEAM_LOGIN_EMAIL?.trim() || TEAM_LOGIN_DEFAULT;
  const loginPassword = process.env.TEAM_LOGIN_PASSWORD?.trim() || null;
  const loginUrl = `${SITE_URL}/login`;
  const ordersUrl = `${SITE_URL}/admin/orders`;
  const orderUrl = `${SITE_URL}/admin/orders/${order.orderNumber}`;
  const toCustomer = order.deliveryMethod === "DELIVERY";

  const credentials = `<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;margin-top:6px;background:${PAGE};border-radius:10px;">
    <tr><td style="padding:10px 14px;font-family:${FONT};font-size:13px;color:${INK};line-height:1.7;text-align:right;">
      <span style="color:${MUTED};">מייל:</span> <b dir="ltr">${esc(loginEmail)}</b><br>
      <span style="color:${MUTED};">סיסמה:</span> ${loginPassword ? `<b dir="ltr">${esc(loginPassword)}</b>` : "סיסמת הצוות"}
    </td></tr>
  </table>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>הזמנה לטיפול ${esc(order.orderNumber)}</title></head>
<body dir="rtl" bgcolor="${PAGE}" style="margin:0;padding:0;background:${PAGE};direction:rtl;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(order.orderNumber)} · ${esc(name)} · ${esc(formatPrice(order.total))}</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};direction:rtl;">
  <tr><td align="center" style="text-align:center;padding:26px 12px;">
    <table role="presentation" dir="rtl" width="560" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;text-align:right;width:560px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 10px rgba(23,47,101,0.07);">

      <tr><td bgcolor="${BRAND}" style="text-align:right;background:${BRAND};background-image:linear-gradient(135deg,#f95c0d 0%,#f34f01 100%);padding:22px 26px;">
        <div style="font-family:${FONT};font-size:12px;font-weight:600;color:rgba(255,255,255,0.85);padding-bottom:5px;">Buy Today · הזמנה לטיפול</div>
        <div style="font-family:${FONT};font-size:24px;font-weight:700;color:#ffffff;line-height:1.25;">היי צוות PR 👋</div>
      </td></tr>

      <tr><td style="padding:22px 26px 0;font-family:${FONT};font-size:15px;color:${INK};line-height:1.6;text-align:right;">
        התקבלה הזמנה חדשה ב‑Buy Today והיא מחכה לטיפול שלכם.
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;margin-top:12px;">
          ${fact("הזמנה", order.orderNumber, orderUrl)}
          ${fact("סכום", formatPrice(order.total))}
          ${fact("תשלום", PAYMENT_TEXT[order.paymentStatus] ?? order.paymentStatus)}
          ${fact("לקוח", name)}
          ${phone ? fact("טלפון", phone, `tel:${phone.replace(/[^\d+]/g, "")}`) : ""}
          ${fact("מסירה", toCustomer ? `משלוח${order.shipCity ? ` ל${order.shipCity}` : ""}` : "איסוף עצמי")}
        </table>
      </td></tr>

      <tr><td style="padding:18px 26px 0;">
        <div style="font-family:${FONT};font-size:12px;font-weight:700;color:${BRAND};padding-bottom:4px;">מה עושים</div>
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;">
          ${step(1, "מתחברים לאתר עם חשבון הצוות:", loginUrl, "לחצו כאן להתחברות")}
          <tr><td></td><td style="padding:0 0 6px;">${credentials}</td></tr>
          ${step(2, "נכנסים לממשק טיפול ההזמנות:", ordersUrl, "ממשק ההזמנות")}
          ${step(3, `פותחים את הזמנה ${esc(order.orderNumber)}:`, orderUrl, "לפתיחת ההזמנה")}
        </table>
      </td></tr>

      <tr><td align="center" style="text-align:center;padding:22px 26px 28px;">
        <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;margin:0 auto;">
          <tr><td align="center" bgcolor="${BRAND}" style="text-align:center;background:${BRAND};background-image:linear-gradient(135deg,#f95c0d 0%,#f34f01 100%);border-radius:12px;">
            <a href="${esc(orderUrl)}" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">לטיפול בהזמנה</a>
          </td></tr>
        </table>
        <div style="padding-top:12px;font-family:${FONT};font-size:12px;color:${MUTED};">אם הקישור מבקש התחברות, מתחברים עם הפרטים למעלה ולוחצים עליו שוב.</div>
      </td></tr>

      <tr><td style="padding:0 26px 22px;border-top:1px solid ${LINE};">
        <div style="padding-top:14px;font-family:${FONT};font-size:12px;color:${MUTED};line-height:1.6;text-align:right;">
          המייל הזה נשלח אוטומטית ואי אפשר להשיב עליו. לשאלות ולתשובות כותבים ל‑<a href="mailto:info@buytoday.co.il" style="color:${BRAND};font-weight:700;text-decoration:none;" dir="ltr">info@buytoday.co.il</a>.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

async function mailTeam(order: AlertOrder & { id: string }, recipients: string[]): Promise<void> {
  try {
    await db.orderNotification.create({
      data: { orderId: order.id, channel: "EMAIL", event: TEAM_EVENT, recipient: recipients.join(", ") },
    });
  } catch {
    return;
  }

  const html = renderTeamEmail(order);
  const text =
    `היי צוות PR, התקבלה הזמנה חדשה ב-Buy Today: ${order.orderNumber} · ${formatPrice(order.total)}\n` +
    `1. התחברות: ${SITE_URL}/login (מייל: ${process.env.TEAM_LOGIN_EMAIL?.trim() || TEAM_LOGIN_DEFAULT})\n` +
    `2. ממשק ההזמנות: ${SITE_URL}/admin/orders\n` +
    `3. ההזמנה: ${SITE_URL}/admin/orders/${order.orderNumber}\n\n` +
    `המייל הזה נשלח אוטומטית ואי אפשר להשיב עליו. לשאלות: info@buytoday.co.il`;
  const subject = `הזמנה לטיפול · ${order.orderNumber} · ${formatPrice(order.total)}`;

  const results = await Promise.all(
    recipients.map((to) => emailChannel.send(to, { subject, body: text, html })),
  );
  const failed = results.filter((r) => !r.ok) as { ok: false; error: string }[];
  await db.orderNotification.updateMany({
    where: { orderId: order.id, channel: "EMAIL", event: TEAM_EVENT },
    data:
      failed.length === results.length
        ? { status: "FAILED", error: failed[0]?.error.slice(0, 300) ?? "send failed" }
        : { status: "SENT", sentAt: new Date(), error: failed[0]?.error.slice(0, 300) ?? null },
  });
}

/**
 * Mail the shop that an order came in.
 *
 * Never throws and never blocks the order: a checkout that succeeded must not
 * be reported to the customer as failed because the shop's own alert bounced.
 */
export async function notifyOwnerOfNewOrder(orderId: string): Promise<void> {
  const recipients = ownerAlertRecipients();
  const mail = recipients.length > 0 && emailChannel.configured();
  const push = ownerPushConfigured();
  const team = teamAlertRecipients();
  const teamMail = team.length > 0 && emailChannel.configured();
  if (!mail && !push && !teamMail) return;

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      total: true,
      paymentStatus: true,
      paymentMethod: true,
      deliveryMethod: true,
      customerNote: true,
      shipCity: true,
      shipStreet: true,
      shipHouseNo: true,
      shipApartment: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { name: true, email: true, phone: true } },
      items: { select: { titleSnap: true, skuSnap: true, quantity: true, priceSnap: true } },
    },
  });
  if (!order) return;

  /* The phone first: it is the one the owner is looking at, and the mail
     can take a moment. Each lane claims its own row, so the push still goes
     when the mail is off, and neither goes twice. */
  await Promise.all([
    push ? pushOwner(order) : null,
    mail ? mailOwner(order, recipients) : null,
    teamMail && moneyTaken(order.paymentStatus) ? mailTeam(order, team) : null,
  ]);
}

async function pushOwner(order: AlertOrder & { id: string }): Promise<void> {
  try {
    await db.orderNotification.create({
      data: { orderId: order.id, channel: "PUSH", event: OWNER_EVENT, recipient: "notify-group" },
    });
  } catch {
    return;
  }
  const result = await sendOwnerPush(order);
  await db.orderNotification.updateMany({
    where: { orderId: order.id, channel: "PUSH", event: OWNER_EVENT },
    data: result.ok
      ? { status: "SENT", sentAt: new Date() }
      : { status: "FAILED", error: result.error.slice(0, 300) },
  });
}

async function mailOwner(order: AlertOrder & { id: string }, recipients: string[]): Promise<void> {
  // Claim first. Two lanes can reach this for one order — creation and the
  // gateway callback — and the row is what makes the second one silent.
  try {
    await db.orderNotification.create({
      data: {
        orderId: order.id,
        channel: "EMAIL",
        event: OWNER_EVENT,
        recipient: recipients.join(", "),
      },
    });
  } catch {
    return;
  }

  const html = renderOwnerEmail(order);
  const text =
    `הזמנה חדשה ${order.orderNumber} · ${formatPrice(order.total)}\n` +
    `לקוח: ${order.user?.name ?? order.guestName ?? "ללא שם"}` +
    `${order.guestPhone ?? order.user?.phone ? ` · ${order.guestPhone ?? order.user?.phone}` : ""}\n` +
    `תשלום: ${PAYMENT_TEXT[order.paymentStatus] ?? order.paymentStatus}\n` +
    `${SITE_URL}/admin/orders/${order.orderNumber}`;

  const subject = `הזמנה חדשה · ${order.orderNumber} · ${formatPrice(order.total)}`;

  /* One send per address rather than one with several recipients, so that a
     bad address in the list cannot suppress the mail to a good one. */
  const results = await Promise.all(
    recipients.map((to) => emailChannel.send(to, { subject, body: text, html })),
  );
  const failed = results.filter((r) => !r.ok) as { ok: false; error: string }[];

  await db.orderNotification.updateMany({
    where: { orderId: order.id, channel: "EMAIL", event: OWNER_EVENT },
    data:
      failed.length === results.length
        ? { status: "FAILED", error: failed[0]?.error.slice(0, 300) ?? "send failed" }
        : { status: "SENT", sentAt: new Date(), error: failed[0]?.error.slice(0, 300) ?? null },
  });
}

/** The alert exactly as it would arrive, for the preview screen. */
export async function previewOwnerAlert(
  orderNumber: string,
  which: "owner" | "team" = "owner",
): Promise<string | null> {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      orderNumber: true,
      total: true,
      paymentStatus: true,
      paymentMethod: true,
      deliveryMethod: true,
      customerNote: true,
      shipCity: true,
      shipStreet: true,
      shipHouseNo: true,
      shipApartment: true,
      guestName: true,
      guestEmail: true,
      guestPhone: true,
      user: { select: { name: true, email: true, phone: true } },
      items: { select: { titleSnap: true, skuSnap: true, quantity: true, priceSnap: true } },
    },
  });
  if (!order) return null;
  return which === "team" ? renderTeamEmail(order) : renderOwnerEmail(order);
}
