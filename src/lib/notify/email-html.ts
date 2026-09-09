import type { NotifyEvent } from "./types";
import { formatPrice } from "@/lib/format";
import { SITE_URL } from "@/lib/site-url";

/**
 * The order email, as HTML.
 *
 * A separate file from messages.ts, and the split is the design. messages.ts
 * writes one sentence per event and all three channels send it, which is
 * right for SMS and WhatsApp: they are one paragraph on a phone and three
 * variants of one paragraph drift apart. Email is not that. It is the only
 * channel where the customer can be shown what they actually bought, and a
 * receipt they can find again in six months is worth more than a line of
 * text — so email keeps the same sentence at the top and puts the order
 * underneath it.
 *
 * Written as tables with inline styles on purpose, which looks like 2005 and
 * is simply what mail clients render. Outlook uses Word to lay out HTML,
 * Gmail strips <style> blocks from the head in some contexts, and neither
 * has flexbox. Every rule that matters is therefore on the element itself.
 *
 * Every colour here is a literal hex. The site's brand orange lives in
 * globals.css as oklch, which no mail client understands, so it is converted
 * once here rather than referenced — with the source noted so the two can be
 * checked against each other.
 */

/** --brand, oklch(0.658 0.209 39.1) in globals.css, converted to sRGB. */
const BRAND = "#f55304";
const INK = "#1f2328";
const MUTED = "#6b7280";
const LINE = "#e7e9ee";
const PAGE = "#f4f5f7";

type Accent = { colour: string; title: string; lead: string };

/**
 * The band at the top of the message.
 *
 * One colour per event and they are not decoration: the customer's inbox
 * shows four mails with almost the same subject line, and the colour is what
 * tells them at a glance whether this is the new one. Green means the money
 * is settled, so nothing else may use it.
 */
function accentFor(event: NotifyEvent, toCustomer: boolean): Accent {
  switch (event) {
    case "ORDER_RECEIVED":
      return {
        colour: BRAND,
        title: "קיבלנו את ההזמנה",
        lead: "ההזמנה נקלטה במערכת ואנחנו עוברים עליה. נעדכן אותך ברגע שהיא מאושרת.",
      };
    case "PAYMENT_APPROVED":
      return {
        colour: "#12805c",
        title: "התשלום אושר",
        lead: toCustomer
          ? "אנחנו מכינים את ההזמנה למשלוח ונעדכן אותך כשהיא יוצאת."
          : "אנחנו מכינים את ההזמנה ונעדכן אותך כשהיא מוכנה לאיסוף.",
      };
    case "SHIPPED":
      return {
        colour: "#1d66c7",
        title: "ההזמנה יצאה אליך",
        lead: "החבילה בדרך. אפשר לעקוב אחריה בקישור שלמטה.",
      };
    case "DELIVERED":
      return {
        colour: "#12805c",
        title: "ההזמנה נמסרה",
        lead: "תודה שקנית אצלנו. אם משהו לא בסדר — אנחנו כאן.",
      };
  }
}

export type OrderForEmail = {
  orderNumber: string;
  createdAt: Date;
  customerName: string;
  subtotal: number;
  discountTotal: number;
  deliveryFee: number;
  total: number;
  deliveryToCustomer: boolean;
  address: string | null;
  items: { title: string; quantity: number; price: number }[];
  courierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackUrl: string;
};

/* Mail is not React and nothing escapes for us. A product title is shop data
   with quotes and ampersands in it, and one unescaped & is a broken row in
   the middle of a receipt. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";

function row(label: string, value: string, opts?: { strong?: boolean; colour?: string }) {
  const weight = opts?.strong ? "700" : "400";
  const size = opts?.strong ? "17px" : "14px";
  const colour = opts?.colour ?? (opts?.strong ? INK : MUTED);
  return `<tr>
    <td align="right" style="padding:6px 0;font-family:${FONT};font-size:${size};color:${colour};font-weight:${weight};">${esc(label)}</td>
    <td align="left" style="padding:6px 0;font-family:${FONT};font-size:${size};color:${colour};font-weight:${weight};white-space:nowrap;">${esc(value)}</td>
  </tr>`;
}

function button(href: string, label: string, colour: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
    <tr><td align="center" bgcolor="${colour}" style="border-radius:10px;">
      <a href="${esc(href)}" style="display:inline-block;padding:14px 34px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(label)}</a>
    </td></tr>
  </table>`;
}

/**
 * The whole message.
 *
 * Order of the blocks is the order the questions get asked: what happened,
 * what did I buy, where is it going, and how do I follow it. The tracking
 * button is last because it is the one thing the customer might click, and a
 * button above the receipt is a button pressed before the receipt is read.
 */
export function renderOrderEmail(event: NotifyEvent, order: OrderForEmail): string {
  const accent = accentFor(event, order.deliveryToCustomer);
  const first = order.customerName.split(" ")[0];
  const placed = new Intl.DateTimeFormat("he-IL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(order.createdAt);

  const items = order.items
    .map(
      (item) => `<tr>
        <td align="right" style="padding:12px 0;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;color:${INK};line-height:1.5;">
          ${esc(item.title)}${item.quantity > 1 ? `<span style="color:${MUTED};"> × ${item.quantity}</span>` : ""}
        </td>
        <td align="left" valign="top" style="padding:12px 0 12px 8px;border-bottom:1px solid ${LINE};font-family:${FONT};font-size:14px;color:${INK};white-space:nowrap;">
          ${esc(formatPrice(item.price * item.quantity))}
        </td>
      </tr>`,
    )
    .join("");

  const totals = [
    row("סכום ביניים", formatPrice(order.subtotal)),
    order.discountTotal > 0 ? row("הנחה", `−${formatPrice(order.discountTotal)}`, { colour: "#12805c" }) : "",
    row(order.deliveryToCustomer ? "משלוח" : "איסוף עצמי", order.deliveryFee > 0 ? formatPrice(order.deliveryFee) : "חינם"),
    `<tr><td colspan="2" style="padding:4px 0;"><div style="border-top:1px solid ${LINE};height:1px;line-height:1px;">&nbsp;</div></td></tr>`,
    row("סה״כ לתשלום", formatPrice(order.total), { strong: true }),
  ].join("");

  /* Where it is going, and only when there is somewhere. A "כתובת: —" line
     on a pickup order is a line that makes the customer wonder whether
     something went wrong. */
  const addressBlock =
    order.deliveryToCustomer && order.address
      ? `<div style="background:${PAGE};border-radius:10px;padding:16px 18px;margin-top:22px;">
            <div style="font-family:${FONT};font-size:12px;color:${MUTED};padding-bottom:4px;">כתובת למשלוח</div>
            <div style="font-family:${FONT};font-size:15px;color:${INK};font-weight:600;line-height:1.5;">${esc(order.address)}</div>
          </div>`
      : "";

  /* The courier's own tracking when there is one, ours otherwise — the same
     rule as the SMS, for the same reason: two links is a link pressed wrong. */
  const hasCourierLink = event === "SHIPPED" && Boolean(order.trackingUrl);
  const ctaHref = hasCourierLink ? order.trackingUrl! : order.trackUrl;
  const ctaLabel = hasCourierLink ? "מעקב אצל השליח" : "מעקב אחרי ההזמנה";

  const courierBlock =
    event === "SHIPPED" && (order.courierName || order.trackingNumber)
      ? `<div style="border:1px solid ${LINE};border-radius:10px;padding:16px 18px;margin-top:22px;">
            ${order.courierName ? `<div style="font-family:${FONT};font-size:14px;color:${INK};padding-bottom:${order.trackingNumber ? "6px" : "0"};">חברת שליחויות: <strong>${esc(order.courierName)}</strong></div>` : ""}
            ${order.trackingNumber ? `<div style="font-family:${FONT};font-size:14px;color:${INK};">מספר מעקב: <strong>${esc(order.trackingNumber)}</strong></div>` : ""}
          </div>`
      : "";

  return `<!DOCTYPE html>
<html dir="rtl" lang="he" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(accent.title)} · ${esc(order.orderNumber)}</title>
</head>
<body style="margin:0;padding:0;background:${PAGE};" bgcolor="${PAGE}">
<!-- The line the inbox shows next to the subject. Without it the client
     grabs the first text in the document, which is the logo's alt text. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(accent.lead)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};">
  <tr><td align="center" style="padding:28px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,0.07);">

      <tr><td style="padding:22px 28px 18px;border-bottom:1px solid ${LINE};">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="right">
            <a href="${esc(SITE_URL)}" style="text-decoration:none;">
              <img src="${esc(SITE_URL)}/brand/logo.png" alt="Buy Today" width="42" height="42" style="display:block;border:0;border-radius:8px;">
            </a>
          </td>
          <td align="left" style="font-family:${FONT};font-size:13px;color:${MUTED};">
            <a href="tel:046639510" style="color:${MUTED};text-decoration:none;">04-6639510</a>
          </td>
        </tr></table>
      </td></tr>

      <tr><td bgcolor="${accent.colour}" style="background:${accent.colour};padding:26px 28px;">
        <div style="font-family:${FONT};font-size:24px;font-weight:700;color:#ffffff;line-height:1.3;">${esc(accent.title)}</div>
        <div style="font-family:${FONT};font-size:14px;color:rgba(255,255,255,0.9);padding-top:6px;">הזמנה ${esc(order.orderNumber)} · ${esc(placed)}</div>
      </td></tr>

      <tr><td style="padding:26px 28px 0;">
        <div style="font-family:${FONT};font-size:16px;color:${INK};line-height:1.6;">היי ${esc(first)},</div>
        <div style="font-family:${FONT};font-size:15px;color:${MUTED};line-height:1.7;padding-top:6px;">${esc(accent.lead)}</div>
      </td></tr>

      <tr><td style="padding:24px 28px 0;">
        <div style="font-family:${FONT};font-size:12px;color:${MUTED};letter-spacing:.04em;padding-bottom:2px;">פרטי ההזמנה</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items}</table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-top:10px;">${totals}</table>
      </td></tr>

      ${
        addressBlock || courierBlock
          ? `<tr><td style="padding:0 28px;">${addressBlock}${courierBlock}</td></tr>`
          : ""
      }

      <tr><td align="center" style="padding:26px 28px 6px;">
        ${button(ctaHref, ctaLabel, accent.colour)}
      </td></tr>

      <tr><td style="padding:18px 28px 26px;">
        <div style="font-family:${FONT};font-size:13px;color:${MUTED};line-height:1.7;text-align:center;">
          שאלה על ההזמנה? אפשר להשיב למייל הזה או להתקשר
          <a href="tel:046639510" style="color:${accent.colour};text-decoration:none;font-weight:600;">04-6639510</a>
        </div>
      </td></tr>
    </table>

    <div style="font-family:${FONT};font-size:12px;color:${MUTED};padding-top:16px;line-height:1.7;">
      <a href="${esc(SITE_URL)}" style="color:${MUTED};text-decoration:none;">buytoday.co.il</a>
      &nbsp;·&nbsp; A&amp;I Electronics &nbsp;·&nbsp; חשמל ומוצרי חשמל
      <br>המייל נשלח בעקבות הזמנה ${esc(order.orderNumber)} שביצעת באתר.
    </div>
  </td></tr>
</table>
</body>
</html>`;
}
