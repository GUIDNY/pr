import type { PaymentStatus } from "@/lib/enums";

/**
 * The traffic light on a salesperson's order card.
 *
 * It reports the money and only the money. That is a decision worth writing
 * down, because a light on a card looks like it summarises the order and this
 * one does not: an order can be green here and still be un-shippable because
 * a product went out of stock. The problems list beside it carries that, and
 * keeping them apart is what makes either of them readable — a single light
 * fed by five inputs tells you something is wrong and never what.
 *
 * Four states for three colours. Grey is not a fourth kind of trouble, it is
 * the absence of a payment to have an opinion about: an order placed on a
 * lane that never charges a card sits there, and colouring it red would put
 * every one of them on a queue of failures.
 */
export type SignalColour = "green" | "orange" | "red" | "grey";

export type OrderSignal = {
  colour: SignalColour;
  label: string;
  /** What the person looking at it should do about it, if anything. */
  hint: string;
};

export function paymentSignal(paymentStatus: PaymentStatus | string): OrderSignal {
  switch (paymentStatus) {
    case "CAPTURED":
      return { colour: "green", label: "שולם", hint: "הכסף התקבל. אפשר להוציא את ההזמנה." };
    case "AUTHORIZED":
      return {
        colour: "orange",
        label: "דפוזיט",
        hint: "המסגרת נתפסה בכרטיס והכסף עדיין לא נגבה. צריך ללחוץ על אישור תשלום.",
      };
    case "FAILED":
      return { colour: "red", label: "התשלום נכשל", hint: "אין תשלום. אין מה להוציא עד שהלקוח משלם." };
    case "REFUNDED":
      return { colour: "red", label: "זוכה", hint: "הכסף הוחזר ללקוח." };
    default:
      return { colour: "grey", label: "טרם שולם", hint: "עוד לא נפתח תשלום להזמנה הזאת." };
  }
}

/** Tailwind for the dot itself. Kept beside the states so a new one cannot be added without a colour. */
export const SIGNAL_DOT: Record<SignalColour, string> = {
  green: "bg-success",
  orange: "bg-warning",
  red: "bg-destructive",
  grey: "bg-muted-foreground/40",
};

export const SIGNAL_CHIP: Record<SignalColour, string> = {
  green: "bg-success/15 text-success",
  orange: "bg-warning/15 text-warning-foreground",
  red: "bg-destructive/15 text-destructive",
  grey: "bg-muted text-muted-foreground",
};

/**
 * Has this customer paid, as the customer understands the word?
 *
 * True for a hold as well as a charge, and the distinction is exactly the
 * point. Under J5 the gateway accepts the card and freezes the money instead
 * of taking it, so from the shop's side the sale is not settled — but from
 * the customer's side nothing is outstanding: they entered a card, it was
 * accepted, they are done. Every screen that faces them has to agree with
 * them.
 *
 * That is four places, and each was written when CAPTURED was the only way
 * an order could be paid:
 *
 *   the cart, which must empty — otherwise they are looking at the items
 *   they just bought and place a second order,
 *   the thank-you page, which must say the order went through,
 *   the payment page, which must not offer to charge them again,
 *   and openPelecardPayment, which must not open a second transaction.
 *
 * Not for revenue. Held money is not takings and the dashboard is right to
 * count only CAPTURED — that one asks a different question and keeps its own
 * answer.
 */
export function customerHasPaid(paymentStatus: PaymentStatus | string): boolean {
  return paymentStatus === "CAPTURED" || paymentStatus === "AUTHORIZED";
}
