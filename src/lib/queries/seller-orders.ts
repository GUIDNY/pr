import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus, PaymentStatus } from "@/lib/enums";
import { ORDER_STAGES, statusesInStage, TRASH_STAGE, type OrderStage } from "@/lib/order-stage";
import { messageFor } from "@/lib/notify/messages";
import { waHref } from "@/lib/notify/whatsapp-link";
import { SITE_URL } from "@/lib/site-url";
import { NOTIFY_EVENTS, type NotifyEvent, type NotifyChannel } from "@/lib/notify/types";
import { courierTrackingUrl } from "@/lib/couriers";
import { channelReadiness } from "@/lib/notify";
import { attributionFromJson, type Attribution } from "@/lib/attribution";

/**
 * The orders queue as a salesperson needs it.
 *
 * Separate from getAdminOrders on purpose. That one answers "show me any
 * order matching these filters" and returns a row for a wide table with a
 * status dropdown, an assignee and a stale-timer. This one answers a
 * different question — "what do I have to do next, and can I" — and every
 * field below exists to make one thing on a card or a page true.
 */

export type OrderProblem = { severity: "block" | "warn"; text: string };

export type SellerOrderSummary = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  customerName: string;
  customerPhone: string | null;
  delivery: { toCustomer: boolean; address: string | null; fee: number };
  itemCount: number;
  problems: OrderProblem[];
  /** When it was moved to the bin, if it was. */
  deletedAt: Date | null;
  /** False for an order that took real money — it can be cancelled, never binned. */
  canBin: boolean;
  /** Stricter: a cancelled order may sit in the bin with a live hold on the
      card, and may not be destroyed until that hold lapses. */
  canPurge: boolean;
};

export type SellerOrderDetail = SellerOrderSummary & {
  customerEmail: string | null;
  /** Where the customer came from, as the browser recorded it. Null for
      orders placed before the shop started keeping it. */
  attribution: Attribution | null;
  customerNote: string | null;
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  paymentMethod: string | null;
  /** What the gateway actually holds or took, which is not always the order total. */
  paid: {
    amount: number;
    heldAmount: number | null;
    holdExpiresAt: Date | null;
    capturedAt: Date | null;
    /** The card as the customer knows it — last four digits, never more. */
    cardLast4: string | null;
    /** "MM/YY", from the gateway. */
    cardExpiry: string | null;
    approvalNo: string | null;
    clearerName: string | null;
  } | null;
  courier: { name: string | null; trackingNumber: string | null; trackingUrl: string | null };
  shippedAt: Date | null;
  deliveredAt: Date | null;
  items: { title: string; sku: string; quantity: number; price: number; cost: number | null; inStock: number | null }[];
  /** What the delivery cost the shop, typed in by hand. Null means nobody
      has entered it, which is not the same as zero — the profit panel says
      which of the two it is looking at. */
  deliveryCost: number | null;
  history: { at: Date; from: string | null; to: string; note: string | null; by: string | null }[];
  notifications: { channel: string; event: string; status: string; error: string | null; at: Date }[];
  /** One row per message the shop sends, whether or not it has gone yet. */
  updates: {
    event: NotifyEvent;
    channels: { channel: NotifyChannel; status: string; error: string | null; at: Date | null }[];
    whatsappHref: string | null;
    /** True once this message is one the order has actually reached. */
    due: boolean;
  }[];
  previousStatus: string | null;
  /** Which channels can send right now — not what was true when a past message went. */
  readiness: { id: NotifyChannel; configured: boolean; missing: string[] }[];
  /** Whether this order may be destroyed outright, or only cancelled. */
  canDelete: boolean;
  /** Bin, purge, and the sentence that says why not. */
  removal: RemovalRule;
};

const LIST_SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  status: true,
  paymentStatus: true,
  total: true,
  deliveryFee: true,
  deliveryMethod: true,
  shipCity: true,
  shipStreet: true,
  shipHouseNo: true,
  shipApartment: true,
  guestName: true,
  guestPhone: true,
  deletedAt: true,
  /* Only to answer "may this one be binned". Two columns rather than the
     whole payment row, on a list that loads 200 of them. */
  payments: { select: { provider: true, status: true, holdExpiresAt: true } },
  user: { select: { name: true, phone: true } },
  items: {
    select: {
      titleSnap: true,
      skuSnap: true,
      quantity: true,
      priceSnap: true,
      product: { select: { stockQty: true } },
    },
  },
} as const;

/**
 * What belongs in a tab.
 *
 * The bin is the one tab that is not a set of statuses, so it is the one
 * branch here: everywhere else `deletedAt: null` is the quiet half of the
 * filter, and it is on every count as well as every list. A binned order
 * that still showed in its old tab's number would be the worst of both —
 * out of the list, present in the badge above it.
 */
function stageWhere(stage: OrderStage) {
  if (stage === TRASH_STAGE) return { deletedAt: { not: null } };
  return { status: { in: statusesInStage(stage) }, deletedAt: null };
}

export async function getSellerOrdersByStage(stage: OrderStage): Promise<SellerOrderSummary[]> {
  const rows = await db.order.findMany({
    where: stageWhere(stage),
    /* In the bin, most recently binned first — somebody who has just put
       twenty orders there and wants one back is looking for the ones they
       just moved, not the oldest order in the shop. */
    orderBy: stage === TRASH_STAGE ? { deletedAt: "desc" } : { createdAt: "desc" },
    take: 200,
    select: LIST_SELECT,
  });
  return rows.map(toSummary);
}

export async function getSellerStageCounts(): Promise<Record<OrderStage, number>> {
  const counts = await Promise.all(
    ORDER_STAGES.map((stage) => db.order.count({ where: stageWhere(stage) })),
  );
  return Object.fromEntries(ORDER_STAGES.map((stage, i) => [stage, counts[i]])) as Record<OrderStage, number>;
}

export async function getSellerOrderDetail(orderNumber: string): Promise<SellerOrderDetail | null> {
  const row = await db.order.findUnique({
    where: { orderNumber },
    select: {
      ...LIST_SELECT,
      /* Only on the detail. The list loads 200 of these and the cost of a
         wide select on a list is what exhausted this project's database
         egress once already. */
      deliveryCost: true,
      items: {
        select: {
          titleSnap: true,
          skuSnap: true,
          quantity: true,
          priceSnap: true,
          costSnap: true,
          product: { select: { stockQty: true } },
        },
      },
      guestEmail: true,
      attribution: true,
      customerNote: true,
      subtotal: true,
      discountTotal: true,
      couponCode: true,
      paymentMethod: true,
      courierName: true,
      trackingNumber: true,
      trackingUrl: true,
      shippedAt: true,
      deliveredAt: true,
      user: { select: { name: true, phone: true, email: true } },
      payments: { orderBy: { createdAt: "desc" } },
      statusHistory: {
        orderBy: { createdAt: "desc" },
        select: {
          createdAt: true,
          fromStatus: true,
          toStatus: true,
          note: true,
          changedBy: { select: { name: true } },
        },
      },
      notifications: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!row) return null;

  const summary = toSummary(row);
  const live = row.payments.find((p) => p.status === "AUTHORIZED" || p.status === "CAPTURED");

  return {
    ...summary,
    customerEmail: row.user?.email ?? row.guestEmail ?? null,
    attribution: attributionFromJson(row.attribution),
    customerNote: row.customerNote,
    subtotal: row.subtotal,
    deliveryCost: row.deliveryCost,
    discountTotal: row.discountTotal,
    couponCode: row.couponCode,
    paymentMethod: row.paymentMethod,
    paid: live
      ? {
          amount: live.amount,
          heldAmount: live.amountAgorot !== null ? live.amountAgorot / 100 : null,
          holdExpiresAt: live.holdExpiresAt,
          capturedAt: live.capturedAt,
          /* What the gateway said about the card, which the callback has been
             storing all along and no screen was showing. It is the first
             thing anybody reaches for on the phone to a customer — "the card
             ending 6254, approval 0914087" — and without it the back office
             had a reference number that means nothing to the person holding
             the card.
             Last four digits only, which is all that is ever stored. */
          cardLast4: live.cardLast4,
          cardExpiry: live.cardExpiry,
          approvalNo: live.approvalNo,
          clearerName: live.clearerName,
        }
      : null,
    courier: {
      name: row.courierName,
      trackingNumber: row.trackingNumber,
      // What was typed in wins; the directory fills in for the couriers whose
      // tracking address is predictable and whose number was entered without
      // one.
      trackingUrl: row.trackingUrl ?? courierTrackingUrl(row.courierName, row.trackingNumber),
    },
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    items: row.items.map((item) => ({
      title: item.titleSnap,
      sku: item.skuSnap,
      quantity: item.quantity,
      price: item.priceSnap,
      cost: item.costSnap,
      inStock: item.product ? item.product.stockQty : null,
    })),
    history: row.statusHistory.map((h) => ({
      at: h.createdAt,
      from: h.fromStatus,
      to: h.toStatus,
      note: h.note,
      by: h.changedBy?.name ?? null,
    })),
    notifications: row.notifications.map((n) => ({
      channel: n.channel,
      event: n.event,
      status: n.status,
      error: n.error,
      at: n.createdAt,
    })),
    updates: buildUpdates(row, summary),
    previousStatus: row.statusHistory[0]?.fromStatus ?? null,
    readiness: channelReadiness(),
    canDelete: removalRule(row).canPurge,
    removal: removalRule(row),
  };
}

/**
 * The four messages, each with what has happened to it on each channel.
 *
 * Every event is listed whether or not it has been sent, and that is the
 * point: a panel that only lists what went out cannot answer "did the
 * customer ever hear that it shipped", which is the question actually being
 * asked. `due` marks the ones the order has already reached, so the ones
 * still ahead of it read as future rather than as failures.
 */
function buildUpdates(
  row: {
    status: string;
    orderNumber: string;
    total: number;
    deliveryMethod: string;
    courierName: string | null;
    trackingNumber: string | null;
    trackingUrl: string | null;
    notifications: { channel: string; event: string; status: string; error: string | null; createdAt: Date }[];
  },
  summary: SellerOrderSummary,
) {
  const reached = new Set<NotifyEvent>(["ORDER_RECEIVED"]);
  const stage = row.status;
  if (["PROCESSING", "AWAITING_SUPPLIER", "SUPPLIER_CONFIRMED", "READY_FOR_DELIVERY", "SHIPPED", "DELIVERED"].includes(stage)) {
    reached.add("PAYMENT_APPROVED");
  }
  if (["SHIPPED", "DELIVERED"].includes(stage)) reached.add("SHIPPED");
  if (stage === "DELIVERED") reached.add("DELIVERED");

  return NOTIFY_EVENTS.map((event) => {
    const message = messageFor(event, {
      orderNumber: row.orderNumber,
      customerName: summary.customerName,
      total: row.total,
      deliveryToCustomer: row.deliveryMethod === "DELIVERY",
      courierName: row.courierName,
      trackingNumber: row.trackingNumber,
      trackingUrl: row.trackingUrl,
      trackUrl: `${SITE_URL}/track-order`,
    });
    const channels = (["EMAIL", "SMS", "WHATSAPP"] as NotifyChannel[]).map((channel) => {
      const found = row.notifications.find((n) => n.channel === channel && n.event === event);
      return {
        channel,
        status: found?.status ?? "NONE",
        error: found?.error ?? null,
        at: found?.createdAt ?? null,
      };
    });
    return {
      event,
      channels,
      whatsappHref: waHref(summary.customerPhone, message.body),
      due: reached.has(event),
    };
  });
}


type ListRow = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  total: number;
  deliveryFee: number;
  deliveryMethod: string;
  shipCity: string | null;
  shipStreet: string | null;
  shipHouseNo: string | null;
  shipApartment: string | null;
  guestName: string | null;
  guestPhone: string | null;
  deletedAt: Date | null;
  payments: { provider: string; status: string }[];
  user: { name: string; phone: string | null } | null;
  items: { titleSnap: string; skuSnap: string; quantity: number; priceSnap: number; product: { stockQty: number } | null }[];
};

function toSummary(row: ListRow): SellerOrderSummary {
  const toCustomer = row.deliveryMethod === "DELIVERY";
  const address = [
    row.shipStreet,
    row.shipHouseNo,
    row.shipApartment && `דירה ${row.shipApartment}`,
    row.shipCity,
  ]
    .filter(Boolean)
    .join(" ");

  const problems: OrderProblem[] = [];

  // A delivery order with nowhere to deliver it. This used to reach the back
  // office silently — see the shipCity comment in schema.prisma — which is
  // why the address is on the front of the card and not below the fold.
  if (toCustomer && !address) {
    problems.push({ severity: "block", text: "הזמנת משלוח בלי כתובת — צריך להתקשר ללקוח" });
  }
  if (!row.guestPhone && !row.user?.phone) {
    problems.push({ severity: "block", text: "אין טלפון ליצירת קשר" });
  }

  // Stock is read now, not from the order. What matters to whoever is picking
  // it is what is on the shelf today.
  for (const item of row.items) {
    const inStock = item.product ? item.product.stockQty : null;
    if (inStock === null) {
      problems.push({ severity: "warn", text: `${item.titleSnap} — המוצר לא קיים יותר בקטלוג` });
    } else if (inStock < item.quantity) {
      problems.push({
        severity: "block",
        text: `${item.titleSnap} — הוזמנו ${item.quantity}, במלאי ${inStock}`,
      });
    }
  }

  return {
    id: row.id,
    orderNumber: row.orderNumber,
    createdAt: row.createdAt,
    status: row.status as OrderStatus,
    paymentStatus: row.paymentStatus as PaymentStatus,
    total: row.total,
    customerName: row.user?.name ?? row.guestName ?? "לקוח ללא שם",
    customerPhone: row.guestPhone ?? row.user?.phone ?? null,
    delivery: { toCustomer, address: address || null, fee: row.deliveryFee },
    itemCount: row.items.reduce((sum, i) => sum + i.quantity, 0),
    problems,
    deletedAt: row.deletedAt,
    /* Both, rather than one flag meaning "selectable": what a row may have
       done to it depends on which list it is being shown in, and the list
       is the only thing that knows. A single flag is what let the bin
       disable the checkbox of an order whose only remaining move was the
       one that is always allowed. */
    canBin: removalRule(row).canBin,
    canPurge: removalRule(row).canPurge,
  };
}

/**
 * The one rule that decides whether an order may be removed at all.
 *
 * Money that MOVED — a capture at the gateway — makes the row a financial
 * record: the shop's, the customer's and the gateway's, and no button in a
 * back office gets to make one disappear. The honest end for those is
 * CANCELLED, which keeps the row and says what happened.
 *
 * A hold is different, and it was not until 15 October. An authorisation
 * freezes the sum on the customer's card and takes nothing; cancelling the
 * order does not release it (nothing here can — it lapses on its own, see
 * Payment.holdExpiresAt), so for up to twenty days the row is the only place
 * that says why ₪1,800 is frozen on somebody's card. The owner asked to
 * delete exactly such an order and could not, and "it took money" was the
 * wrong answer: it took none. So a cancelled order whose hold is still
 * running may go to the BIN — out of every list, still here for the phone
 * call — and may be destroyed only once the hold has lapsed. A hold on an
 * order that is not cancelled blocks both: bin the order and the hold is
 * forgotten while the customer's money is still frozen.
 *
 * Shared by the list, the order page and all three bin actions so the
 * button a person sees and the check the server makes can never say
 * different things.
 */
export type RemovablePayment = { provider: string; status: string; holdExpiresAt?: Date | null };

/** Money moved: a real capture. */
export function tookRealMoney(payments: { provider: string; status: string }[]): boolean {
  return payments.some((p) => p.provider !== "DEMO" && p.status === "CAPTURED");
}

/** The hold that is still sitting on a customer's card, if any. */
export function activeHold(payments: RemovablePayment[], now = new Date()): RemovablePayment | null {
  return (
    payments.find(
      (p) => p.provider !== "DEMO" && p.status === "AUTHORIZED" && (!p.holdExpiresAt || p.holdExpiresAt > now),
    ) ?? null
  );
}

export type RemovalRule = { canBin: boolean; canPurge: boolean; reason: string | null };

/** Which way an order is moving through the bin. */
export type BinDirection = "bin" | "restore" | "purge";

/**
 * May this order make this move?
 *
 * `removalRule` answers what the row **is**; this answers what may be
 * **done** with it, and the two are not the same question in one direction:
 * restoring is always allowed.
 *
 * It was not, and the trap it made is worth writing down because the code
 * that caused it looked careful. `loadSelection` ran the binning rule on
 * restore too, reasoning that "the rule is about what the row is, not about
 * which direction it is moving, and an order that took real money should
 * never have been in the bin to begin with". The second half is the flaw:
 * the row's answer can change **after** it is binned, and then the same
 * rule that let it in refuses to let it out.
 *
 * PR-379226 did exactly that. Cancelled on 25 October with a ₪290 hold
 * still live, which `removalRule` permits (`hold && status === CANCELLED`
 * → canBin). Binned at 00:51 the next night, legally. Then at 14:35
 * somebody pressed "ביטול הפעולה האחרונה" and the status went CANCELLED →
 * NEW while the order sat in the bin — and `hold && status !== CANCELLED`
 * is the one combination the rule refuses. The order was out of every
 * queue, every count and every list, and could not be brought back.
 *
 * Restoring is the safe direction by construction: it puts the row back
 * where people can see it. There is no state of the money for which the
 * right answer is "leave it hidden", and the only thing a refusal here can
 * protect is the bin's own tidiness.
 */
export function binActionAllowed(
  order: { status: string; payments: RemovablePayment[] },
  direction: BinDirection,
  now = new Date(),
): { allowed: boolean; reason: string | null } {
  if (direction === "restore") return { allowed: true, reason: null };
  const rule = removalRule(order, now);
  const allowed = direction === "purge" ? rule.canPurge : rule.canBin;
  return { allowed, reason: allowed ? null : rule.reason };
}

export function removalRule(order: { status: string; payments: RemovablePayment[] }, now = new Date()): RemovalRule {
  if (tookRealMoney(order.payments)) {
    return {
      canBin: false,
      canPurge: false,
      reason: "בהזמנה הזאת נגבה כסף אמיתי, ולכן אי אפשר למחוק אותה — זה רישום כספי. אפשר לבטל אותה, והביטול נשמר.",
    };
  }
  const hold = activeHold(order.payments, now);
  if (hold && order.status !== "CANCELLED") {
    return {
      canBin: false,
      canPurge: false,
      reason: "יש תפיסה פעילה בכרטיס של הלקוח. קודם מבטלים את ההזמנה; אחרי הביטול אפשר להעביר אותה לפח.",
    };
  }
  if (hold) {
    const until = hold.holdExpiresAt
      ? new Intl.DateTimeFormat("he-IL", {
          timeZone: "Asia/Jerusalem",
          day: "numeric",
          month: "numeric",
          year: "numeric",
        }).format(hold.holdExpiresAt)
      : null;
    return {
      canBin: true,
      canPurge: false,
      reason: `ההזמנה בוטלה, אבל התפיסה בכרטיס של הלקוח עדיין תקפה${until ? ` עד ${until}` : ""} — הכסף לא נגבה והוא ישתחרר מעצמו. עד אז אפשר להעביר לפח (יוצא מהרשימות, נשאר לרישום), ולמחוק לצמיתות רק אחרי שהתפיסה פוקעת.`,
    };
  }
  return { canBin: true, canPurge: true, reason: null };
}

