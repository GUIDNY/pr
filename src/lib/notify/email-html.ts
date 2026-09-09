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
 * is simply what mail clients render. Outlook lays HTML out with Word, Gmail
 * strips <style> blocks from the head in some contexts, and neither has
 * flexbox. Every rule that matters is therefore on the element itself.
 *
 * Two consequences of that are repeated everywhere below and neither is
 * redundancy:
 *
 *   dir="rtl" is on the body, on every table and again as direction:rtl in
 *   the styles. Gmail throws away <html> and <head> and grafts what is left
 *   into its own LTR document, so a dir on <html> reaches nobody — and the
 *   symptom is not that the mail flips, it is that a full stop lands at the
 *   start of the sentence and "משלוח" and "חינם" print as one word.
 *
 *   Alignment is written twice, as align="right" and as text-align:right.
 *   The wrapper that centres the 600px card sets text-align:center, which
 *   inherits into every cell inside it; the attribute alone does not beat
 *   it, so the receipt collapses into a centred column with the price
 *   touching the label.
 */

/* The shop's colours, as hex, because no mail client parses oklch.
   Taken from the tokens in globals.css and from the comment above them that
   records where those came from: the brand orange is sampled off
   public/brand/logo.png, whose tile is a gradient running #F95C0D to
   #F34F01 with its core at #F55305. The gradient is reproduced here rather
   than flattened, so the band at the top of the message is the same object
   as the mark sitting above it. */
const BRAND = "#f55305";
const BRAND_LIGHT = "#f95c0d";
const BRAND_DARK = "#f34f01";
/** A wash of the brand, for the one row that has to be read before the rest. */
const BRAND_TINT = "#fff3ec";
/** --primary: the logo's plug-icon navy, which is the site's footer. */
const NAVY = "#172f65";
const INK = "#1f2328";
const MUTED = "#6b7280";
const LINE = "#ececf1";
const PAGE = "#f5f4f2";

/**
 * What the message says it is.
 *
 * One orange for all four, unlike the first version of this file, which gave
 * each event its own colour. Green for approved and blue for shipped read as
 * a status system and were really a second brand: four mails from one shop
 * that do not look like each other, and none of them like the site. The
 * heading already says which message this is, so the colour has nothing left
 * to do except be the shop's.
 */
type Accent = { title: string; lead: string };

function accentFor(event: NotifyEvent, toCustomer: boolean): Accent {
  switch (event) {
    case "ORDER_RECEIVED":
      return {
        title: "קיבלנו את ההזמנה",
        lead: "ההזמנה נקלטה במערכת ואנחנו עוברים עליה. נעדכן אותך ברגע שהיא מאושרת.",
      };
    case "PAYMENT_APPROVED":
      return {
        title: "התשלום אושר",
        lead: toCustomer
          ? "אנחנו מכינים את ההזמנה למשלוח ונעדכן אותך כשהיא יוצאת."
          : "אנחנו מכינים את ההזמנה ונעדכן אותך כשהיא מוכנה לאיסוף.",
      };
    case "SHIPPED":
      return {
        title: "ההזמנה יצאה אליך",
        lead: "החבילה בדרך. אפשר לעקוב אחריה בקישור שלמטה.",
      };
    case "DELIVERED":
      return {
        title: "ההזמנה נמסרה",
        lead: "תודה שקנית אצלנו. אם משהו לא בסדר — אנחנו כאן.",
      };
  }
}

export type OrderForEmail = {
  orderNumber: string;
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

function totalsRow(label: string, value: string, colour = MUTED) {
  return `<tr>
    <td align="right" style="text-align:right;padding:5px 0;font-family:${FONT};font-size:14px;color:${colour};">${esc(label)}</td>
    <td align="left" style="text-align:left;padding:5px 0;font-family:${FONT};font-size:14px;color:${colour};white-space:nowrap;">${esc(value)}</td>
  </tr>`;
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

  const items = order.items
    .map(
      (item, index) => `<tr>
        <td align="right" style="text-align:right;padding:${index === 0 ? "0" : "14px"} 0 14px;${index === 0 ? "" : `border-top:1px solid ${LINE};`}font-family:${FONT};font-size:14px;color:${INK};line-height:1.55;">
          ${esc(item.title)}${item.quantity > 1 ? `<br><span style="color:${MUTED};font-size:13px;">כמות: ${item.quantity}</span>` : ""}
        </td>
        <td align="left" valign="top" style="text-align:left;padding:${index === 0 ? "0" : "14px"} 0 14px 4px;${index === 0 ? "" : `border-top:1px solid ${LINE};`}font-family:${FONT};font-size:14px;font-weight:600;color:${INK};white-space:nowrap;">
          ${esc(formatPrice(item.price * item.quantity))}
        </td>
      </tr>`,
    )
    .join("");

  const totals = [
    totalsRow("סכום ביניים", formatPrice(order.subtotal)),
    order.discountTotal > 0 ? totalsRow("הנחה", `−${formatPrice(order.discountTotal)}`, BRAND) : "",
    totalsRow(
      order.deliveryToCustomer ? "משלוח" : "איסוף עצמי",
      order.deliveryFee > 0 ? formatPrice(order.deliveryFee) : "חינם",
    ),
  ].join("");

  /* Where it is going, and only when there is somewhere. A "כתובת: —" line
     on a pickup order is a line that makes the customer wonder whether
     something went wrong. */
  const addressBlock =
    order.deliveryToCustomer && order.address
      ? `<div style="background:${PAGE};border-radius:12px;padding:16px 18px;margin-top:20px;">
            <div style="font-family:${FONT};font-size:12px;color:${MUTED};padding-bottom:5px;">כתובת למשלוח</div>
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
      ? `<div style="background:${BRAND_TINT};border-radius:12px;padding:16px 18px;margin-top:20px;">
            ${order.courierName ? `<div style="font-family:${FONT};font-size:14px;color:${INK};padding-bottom:${order.trackingNumber ? "5px" : "0"};">חברת שליחויות: <strong>${esc(order.courierName)}</strong></div>` : ""}
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
<body dir="rtl" style="margin:0;padding:0;background:${PAGE};direction:rtl;" bgcolor="${PAGE}">
<!-- The line the inbox shows next to the subject. Without it the client
     grabs the first text in the document, which is the logo's alt text. -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(accent.lead)}</div>
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAGE}" style="background:${PAGE};direction:rtl;">
  <tr><td align="center" style="text-align:center;padding:30px 12px 34px;">
    <table role="presentation" dir="rtl" width="600" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;text-align:right;width:600px;max-width:100%;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 2px 10px rgba(23,47,101,0.07);">

      <tr><td style="padding:20px 30px;">
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;"><tr>
          <td align="right" style="text-align:right;">
            <a href="${esc(SITE_URL)}" style="text-decoration:none;">
              <img src="${esc(SITE_URL)}/brand/logo.png" alt="Buy Today" width="40" height="40" style="display:block;border:0;border-radius:9px;">
            </a>
          </td>
          <td align="left" style="text-align:left;font-family:${FONT};font-size:13px;color:${MUTED};">
            <a href="tel:046639510" style="color:${MUTED};text-decoration:none;">04-6639510</a>
          </td>
        </tr></table>
      </td></tr>

      <!-- bgcolor carries Outlook, which ignores the gradient and is meant to. -->
      <tr><td bgcolor="${BRAND}" style="background:${BRAND};background-image:linear-gradient(135deg, ${BRAND_LIGHT} 0%, ${BRAND_DARK} 100%);padding:30px;">
        <div style="font-family:${FONT};font-size:12px;font-weight:600;color:rgba(255,255,255,0.82);letter-spacing:.05em;padding-bottom:7px;">הזמנה ${esc(order.orderNumber)}</div>
        <div style="font-family:${FONT};font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;">${esc(accent.title)}</div>
      </td></tr>

      <tr><td style="padding:28px 30px 0;">
        <div style="font-family:${FONT};font-size:17px;font-weight:700;color:${INK};line-height:1.5;">היי ${esc(first)},</div>
        <div style="font-family:${FONT};font-size:15px;color:${MUTED};line-height:1.75;padding-top:6px;">${esc(accent.lead)}</div>
      </td></tr>

      <tr><td style="padding:26px 30px 0;">
        <div style="font-family:${FONT};font-size:12px;font-weight:700;color:${BRAND};letter-spacing:.06em;padding-bottom:12px;">מה הזמנת</div>
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;">${items}</table>
      </td></tr>

      <tr><td style="padding:6px 30px 0;">
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;border-top:1px solid ${LINE};">
          <tr><td colspan="2" style="height:10px;line-height:10px;">&nbsp;</td></tr>
          ${totals}
        </table>
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND_TINT}" style="direction:rtl;background:${BRAND_TINT};border-radius:12px;margin-top:10px;">
          <tr>
            <td align="right" style="text-align:right;padding:14px 16px;font-family:${FONT};font-size:15px;font-weight:700;color:${INK};">סה״כ לתשלום</td>
            <td align="left" style="text-align:left;padding:14px 16px;font-family:${FONT};font-size:20px;font-weight:700;color:${BRAND};white-space:nowrap;">${esc(formatPrice(order.total))}</td>
          </tr>
        </table>
      </td></tr>
${
  addressBlock || courierBlock
    ? `      <tr><td style="padding:0 30px;">${addressBlock}${courierBlock}</td></tr>\n`
    : ""
}
      <tr><td align="center" style="text-align:center;padding:28px 30px 0;">
        <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;margin:0 auto;">
          <tr><td align="center" bgcolor="${BRAND}" style="text-align:center;background:${BRAND};background-image:linear-gradient(135deg, ${BRAND_LIGHT} 0%, ${BRAND_DARK} 100%);border-radius:12px;">
            <a href="${esc(ctaHref)}" style="display:inline-block;padding:15px 40px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(ctaLabel)}</a>
          </td></tr>
        </table>
      </td></tr>

      <tr><td style="padding:20px 30px 30px;">
        <div style="font-family:${FONT};font-size:13px;color:${MUTED};line-height:1.75;text-align:center;">
          שאלה על ההזמנה? אפשר להשיב למייל הזה או להתקשר
          <a href="tel:046639510" style="color:${BRAND};text-decoration:none;font-weight:700;">04-6639510</a>
        </div>
      </td></tr>

      <tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:18px 30px;">
        <table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;"><tr>
          <td align="right" style="text-align:right;font-family:${FONT};font-size:13px;font-weight:700;color:#ffffff;">
            <a href="${esc(SITE_URL)}" style="color:#ffffff;text-decoration:none;">buytoday.co.il</a>
          </td>
          <td align="left" style="text-align:left;font-family:${FONT};font-size:12px;color:rgba(255,255,255,0.65);">A&amp;I Electronics</td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
