import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus, PaymentStatus } from "@/lib/enums";
import { statusesInStage, type OrderStage } from "@/lib/order-stage";

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
};

export type SellerOrderDetail = SellerOrderSummary & {
  customerEmail: string | null;
  customerNote: string | null;
  subtotal: number;
  discountTotal: number;
  couponCode: string | null;
  paymentMethod: string | null;
  /** What the gateway actually holds or took, which is not always the order total. */
  paid: { amount: number; heldAmount: number | null; holdExpiresAt: Date | null; capturedAt: Date | null } | null;
  courier: { name: string | null; trackingNumber: string | null; trackingUrl: string | null };
  shippedAt: Date | null;
  deliveredAt: Date | null;
  items: { title: string; sku: string; quantity: number; price: number; inStock: number | null }[];
  history: { at: Date; from: string | null; to: string; note: string | null; by: string | null }[];
  notifications: { channel: string; event: string; status: string; error: string | null; at: Date }[];
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

export async function getSellerOrdersByStage(stage: OrderStage): Promise<SellerOrderSummary[]> {
  const rows = await db.order.findMany({
    where: { status: { in: statusesInStage(stage) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: LIST_SELECT,
  });
  return rows.map(toSummary);
}

export async function getSellerStageCounts(): Promise<Record<OrderStage, number>> {
  const [open, processing, closed] = await Promise.all(
    (["open", "processing", "closed"] as const).map((stage) =>
      db.order.count({ where: { status: { in: statusesInStage(stage) } } }),
    ),
  );
  return { open, processing, closed };
}

export async function getSellerOrderDetail(orderNumber: string): Promise<SellerOrderDetail | null> {
  const row = await db.order.findUnique({
    where: { orderNumber },
    select: {
      ...LIST_SELECT,
      guestEmail: true,
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
    customerNote: row.customerNote,
    subtotal: row.subtotal,
    discountTotal: row.discountTotal,
    couponCode: row.couponCode,
    paymentMethod: row.paymentMethod,
    paid: live
      ? {
          amount: live.amount,
          heldAmount: live.amountAgorot !== null ? live.amountAgorot / 100 : null,
          holdExpiresAt: live.holdExpiresAt,
          capturedAt: live.capturedAt,
        }
      : null,
    courier: {
      name: row.courierName,
      trackingNumber: row.trackingNumber,
      trackingUrl: row.trackingUrl,
    },
    shippedAt: row.shippedAt,
    deliveredAt: row.deliveredAt,
    items: row.items.map((item) => ({
      title: item.titleSnap,
      sku: item.skuSnap,
      quantity: item.quantity,
      price: item.priceSnap,
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
  };
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
  };
}
