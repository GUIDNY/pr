import { customerHasPaid } from "@/lib/order-signal";

export type PaymentNotice = { tone: "paid" | "pending" | "failed"; title: string; body: string } | null;

/**
 * What /track-order says about the money, in one line a worried customer can
 * read. On 17 November a customer whose card had been authorised saw no
 * confirmation, came back and paid twice more; the one sentence they needed
 * was "שולם, ההזמנה התקבלה — אין צורך לשלם שוב".
 *
 * Card orders only: a cash, transfer or phone order has no gateway status to
 * report, and saying "not paid" about cash on delivery would be wrong.
 */
export function paymentNotice(order: { paymentStatus: string | null; paymentMethod: string | null }): PaymentNotice {
  if (order.paymentStatus && customerHasPaid(order.paymentStatus)) {
    return {
      tone: "paid",
      title: "שולם, ההזמנה התקבלה",
      body: "התשלום אושר והזמנתכם בטיפול. אין צורך לשלם שוב.",
    };
  }
  if (order.paymentMethod !== "PELECARD") return null;
  if (order.paymentStatus === "FAILED") {
    return {
      tone: "failed",
      title: "התשלום לא הושלם",
      body: "לא בוצע חיוב בהזמנה הזו. אפשר לנסות שוב מהעגלה, או להתקשר אלינו ונשלים יחד.",
    };
  }
  return {
    tone: "pending",
    title: "התשלום עדיין לא אושר",
    body: "אם כבר שילמתם, לא לשלם שוב — האישור מגיע לעיתים באיחור של כמה דקות. בכל ספק התקשרו אלינו.",
  };
}
