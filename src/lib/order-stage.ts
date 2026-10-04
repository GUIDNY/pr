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
/* "unpaid" is the shelf for an order whose payment never completed — the
   customer reached the payment page and left. It used to sit in "open"
   beside the orders that are actually waiting for the team, and with eight
   of them to one real order the open tab was a list of abandoned carts with
   a sale hidden in it. Last in the row, because it is where the team looks
   only when chasing. */
/* "trash" is the one tab that is not a set of statuses. Every other stage
   answers "where is this order in its life"; the bin answers "is it in the
   queue at all", which is Order.deletedAt and orthogonal to status — a
   cancelled order and a never-paid one can both be litter. It is listed
   here so it gets a tab and a count like the rest, and every query that
   folds statuses into stages has to special-case it rather than look it up
   in STAGE_OF. That is why STAGE_OF below stays a Record of statuses: a
   fourteenth status still cannot be added without the compiler asking which
   of the four real stages it belongs to, and the answer is never "trash". */
export const ORDER_STAGES = ["open", "processing", "closed", "unpaid", "trash"] as const;
export type OrderStage = (typeof ORDER_STAGES)[number];

/** The bin, which is a flag on the row rather than a status it reached. */
export const TRASH_STAGE = "trash" satisfies OrderStage;

const STAGE_OF: Record<OrderStatus, Exclude<OrderStage, typeof TRASH_STAGE>> = {
  // Nothing has been decided about these yet. PAYMENT_FAILED sits here too,
  // and deliberately: a failed payment is not a finished order, it is an
  // order somebody has to ring about, and filing it under closed is how it
  // stops being anybody's problem.
  NEW: "open",
  PAID: "open",

  PAYMENT_PENDING: "unpaid",
  PAYMENT_FAILED: "unpaid",

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
  unpaid: "עגלות נטושות",
  trash: "פח",
};

/** What a person is meant to do with the orders in each tab. */
export const STAGE_HINTS: Record<OrderStage, string> = {
  open: "התשלום נתפס — ממתינות לבדיקה ולאישור",
  processing: "אושרו ויצאו לדרך — מעקב מול השליח",
  closed: "הסתיימו: נמסרו, בוטלו או זוכו",
  unpaid: "טרם שולם: הלקוח הגיע לתשלום ולא השלים אותו — כאן מתקשרים ומזכירים",
  trash: "הוצאו מהתור ולא נמחקו. אפשר לשחזר, או למחוק מכאן לצמיתות",
};

export function isStage(value: string | undefined): value is OrderStage {
  return ORDER_STAGES.includes(value as OrderStage);
}
