import type { NotifyEvent } from "./types";
import type { OrderStatus } from "@/lib/enums";

/**
 * Sending the WhatsApp by hand, until Meta approves the templates.
 *
 * A wa.me link opens the message already typed into the salesperson's own
 * WhatsApp, and they press send. It is not automation and it does not
 * pretend to be — but it is the same wording the automatic one will use, so
 * customers get a consistent voice now and nothing has to be re-learned when
 * the API replaces it.
 *
 * Worth being clear about the difference: this sends from a person's own
 * number, which is why it is allowed at all. Meta's template rule governs a
 * business opening a conversation programmatically; a human typing into
 * their own WhatsApp is a human typing into their own WhatsApp.
 */

/** The message this order is due, judged from where it has got to. */
export function currentNotifyEvent(status: OrderStatus | string): NotifyEvent {
  switch (status) {
    case "SHIPPED":
      return "SHIPPED";
    case "DELIVERED":
      return "DELIVERED";
    case "PROCESSING":
    case "AWAITING_SUPPLIER":
    case "SUPPLIER_CONFIRMED":
    case "READY_FOR_DELIVERY":
      return "PAYMENT_APPROVED";
    default:
      return "ORDER_RECEIVED";
  }
}

/**
 * An Israeli phone number as WhatsApp wants it: country code, no plus, no
 * separators, no leading zero.
 *
 * Returns null rather than a guess for anything it does not recognise. A
 * wa.me link built from a mangled number opens a chat with a stranger, and
 * the salesperson finds out after sending.
 */
export function waNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits.length >= 11 ? digits : null;
  if (digits.startsWith("0")) return digits.length === 10 || digits.length === 9 ? `972${digits.slice(1)}` : null;
  return null;
}

export function waHref(phone: string | null | undefined, body: string): string | null {
  const number = waNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(body)}`;
}
