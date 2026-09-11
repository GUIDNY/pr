import type { Message, NotifyEvent } from "./types";
import { formatPrice } from "@/lib/format";

export type OrderForMessage = {
  orderNumber: string;
  customerName: string;
  total: number;
  deliveryToCustomer: boolean;
  courierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  trackUrl: string;
};

/**
 * What each message says.
 *
 * One text per event, used by all three channels. Not because email could
 * not be richer, but because three versions of the same sentence drift, and
 * the one that drifts is always the one nobody re-reads — the SMS, which is
 * also the one most people actually see.
 *
 * Short, and every one of them ends somewhere the customer can go. A
 * notification that only announces is a notification that generates a phone
 * call asking the obvious follow-up.
 */
export function messageFor(event: NotifyEvent, order: OrderForMessage): Message {
  const name = order.customerName.split(" ")[0];

  switch (event) {
    case "ORDER_RECEIVED":
      return {
        subject: `קיבלנו את ההזמנה שלך · ${order.orderNumber}`,
        body:
          `היי ${name}, קיבלנו את הזמנה ${order.orderNumber} על סך ${formatPrice(order.total)}.\n` +
          `אנחנו בודקים אותה ומעדכנים אותך ברגע שהיא מאושרת.\n` +
          `למעקב: ${order.trackUrl}`,
      };

    case "PAYMENT_APPROVED":
      return {
        subject: `ההזמנה אושרה · ${order.orderNumber}`,
        body:
          `היי ${name}, התשלום על הזמנה ${order.orderNumber} אושר ואנחנו מכינים אותה.\n` +
          (order.deliveryToCustomer
            ? "נעדכן אותך שוב כשהיא יוצאת למשלוח.\n"
            : "נעדכן אותך שוב כשהיא מוכנה לאיסוף.\n") +
          `למעקב: ${order.trackUrl}`,
      };

    case "SHIPPED": {
      // The courier's own tracking link when there is one, ours when there is
      // not. Never both: two links in one message is a message where the
      // customer picks the wrong one.
      const tracking = order.trackingUrl
        ? `מעקב אצל השליח: ${order.trackingUrl}`
        : order.trackingNumber
          ? `מספר מעקב: ${order.trackingNumber}`
          : `למעקב: ${order.trackUrl}`;
      return {
        subject: `ההזמנה יצאה אליך · ${order.orderNumber}`,
        body:
          `היי ${name}, הזמנה ${order.orderNumber} יצאה אליך` +
          (order.courierName ? ` עם ${order.courierName}` : "") +
          `.\n${tracking}`,
      };
    }

    case "DELIVERED":
      return {
        subject: `ההזמנה הגיעה · ${order.orderNumber}`,
        body:
          `היי ${name}, הזמנה ${order.orderNumber} נמסרה. תודה שקנית אצלנו!\n` +
          `אם משהו לא בסדר — פשוט השב להודעה הזאת או התקשר 04-6639510.`,
      };
  }
}
