import type { OrderStatus } from "@/lib/enums";

/**
 * The shop's thirteen order statuses, folded into the three a salesperson
 * works in.
 *
 * The thirteen are not wrong — they are what the customer's tracking page
 * and the manager's reports need, and each one means something different to
 * somebody. They are just not a workflow. Somebody clearing a queue has
 * three questions, and they are these: what have I not looked at yet, what
 * is out in the world, and what is finished.
 *
 * So the folding lives here rather than in the tabs that render it, and the
 * exhaustive Record is the point: a fourteenth status cannot be added to
 * enums.ts without the compiler asking which of the three it belongs to.
 * The alternative — a default branch — is how a new status quietly lands in
 * "open" and stays there forever because nobody is looking for it.
 */
export const ORDER_STAGES = ["open", "processing", "closed"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

const STAGE_OF: Record<OrderStatus, OrderStage> = {
  // Nothing has been decided about these yet. PAYMENT_FAILED sits here too,
  // and deliberately: a failed payment is not a finished order, it is an
  // order somebody has to ring about, and filing it under closed is how it
  // stops being anybody's problem.
  NEW: "open",
  PAYMENT_PENDING: "open",
  PAYMENT_FAILED: "open",
  PAID: "open",

  // Approved and moving. The order is out of the salesperson's hands and
  // into the warehouse's, the supplier's or the courier's.
  PROCESSING: "processing",
  AWAITING_SUPPLIER: "processing",
  SUPPLIER_CONFIRMED: "processing",
  READY_FOR_DELIVERY: "processing",
  SHIPPED: "processing",

  // Over, one way or another. REFUND_PENDING is here rather than in
  // processing because the thing still moving is money, not goods, and it is
  // not this queue's work.
  DELIVERED: "closed",
  CANCELLED: "closed",
  REFUND_PENDING: "closed",
  REFUNDED: "closed",
};

export function stageOf(status: OrderStatus | string): OrderStage {
  return STAGE_OF[status as OrderStatus] ?? "open";
}

export function statusesInStage(stage: OrderStage): OrderStatus[] {
  return (Object.keys(STAGE_OF) as OrderStatus[]).filter((s) => STAGE_OF[s] === stage);
}

export const STAGE_LABELS: Record<OrderStage, string> = {
  open: "הזמנות פתוחות",
  processing: "הזמנות בתהליך",
  closed: "הזמנות סגורות",
};

/** What a person is meant to do with the orders in each tab. */
export const STAGE_HINTS: Record<OrderStage, string> = {
  open: "ממתינות לבדיקה ולאישור תשלום",
  processing: "אושרו ויצאו לדרך — מעקב מול השליח",
  closed: "הסתיימו: נמסרו, בוטלו או זוכו",
};

export function isStage(value: string | undefined): value is OrderStage {
  return ORDER_STAGES.includes(value as OrderStage);
}
