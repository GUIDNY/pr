import { BUSINESS } from "@/lib/business";

/**
 * Telling a customer the order cannot be supplied.
 *
 * Deliberately not one of the four NOTIFY_EVENTS. Those are moments in an
 * order's life that arrive on their own, and the order page renders each
 * with a resend button beside it — see the note in notify/types.ts about
 * what an internal template does in that list. A cancellation is not a
 * moment that arrives; it is a decision somebody makes, once, and it needs
 * reading before it is sent. So it is built here, handed to the order page
 * as prepared text, and nothing sends it automatically.
 *
 * THE ONE LINE THAT CANNOT BE FIXED WORDING, and the reason this is a
 * function rather than a constant: the owner's draft reads "כרטיס האשראי
 * שלך לא יחויב, ומסגרת האשראי שנתפסה תשוחרר". That is exactly right for a
 * card that was *authorised* — a hold, which Pelecard releases — and it is
 * a false statement to a customer whose card was already *captured*. Those
 * two are a single enum value apart on the order and look identical on the
 * order page, so a fixed paragraph would eventually promise "you will not
 * be charged" to somebody already charged. Each payment state gets the
 * sentence that is true of it, and a state we do not recognise gets no
 * money sentence at all rather than a guessed one.
 */

export type CancellationMoney = "HOLD_RELEASED" | "REFUND" | "NOTHING_TAKEN";

/** What the customer's money is actually doing, from the payment status. */
export function cancellationMoneyFor(paymentStatus: string | null | undefined): CancellationMoney {
  switch (paymentStatus) {
    case "AUTHORIZED":
      return "HOLD_RELEASED";
    case "CAPTURED":
    case "REFUND_PENDING":
    case "REFUNDED":
      return "REFUND";
    default:
      /* PENDING, FAILED, CANCELLED, or nothing at all: no money has moved,
         so there is nothing to promise about it. */
      return "NOTHING_TAKEN";
  }
}

const MONEY_LINE: Record<CancellationMoney, string> = {
  HOLD_RELEASED: "כרטיס האשראי שלך לא יחויב, ומסגרת האשראי שנתפסה תשוחרר באופן מיידי.",
  REFUND: "התשלום יוחזר לכרטיס האשראי שלך במלואו. הזיכוי מופיע אצל חברת האשראי תוך מספר ימי עסקים.",
  NOTHING_TAKEN: "לא בוצע חיוב בכרטיס האשראי שלך.",
};

export type CancellationOrder = {
  orderNumber: string;
  customerName: string;
  paymentStatus?: string | null;
};

export type CancellationMessage = {
  subject: string;
  body: string;
  money: CancellationMoney;
};

/**
 * The owner's own wording, with the name, the order number and the money
 * sentence filled in.
 *
 * `signedBy` defaults to the name he signs with; a different salesperson
 * sending it passes their own rather than signing somebody else's name.
 */
export function cancellationMessage(
  order: CancellationOrder,
  signedBy = "עידן",
): CancellationMessage {
  /* The first word of the name, like every other message the shop sends —
     "שלום ששון כהן" reads like a letter from a bank. */
  const name = (order.customerName ?? "").trim().split(/\s+/)[0] || "לקוח יקר";
  const money = cancellationMoneyFor(order.paymentStatus);

  return {
    subject: `ביטול הזמנה ${order.orderNumber}`,
    body:
      `שלום ${name},\n\n` +
      `לצערנו, נפלה טעות בהזמנה מספר ${order.orderNumber}, והמוצר שהזמנת אינו זמין עוד במלאי.\n\n` +
      `${MONEY_LINE[money]}\n\n` +
      `אנו מתנצלים על אי הנוחות ומודים לך מראש על ההבנה.\n\n` +
      `בברכה,\n${signedBy}\n${BUSINESS.name}`,
    money,
  };
}
