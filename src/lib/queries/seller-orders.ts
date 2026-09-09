import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus, PaymentStatus } from "@/lib/enums";

/**
 * The orders queue as a salesperson needs it.
 *
 * Separate from getAdminOrders on purpose. That one answers "show me any
 * order matching these filters" and returns a row for a wide table with a
 * status dropdown, an assignee and a stale-timer. This one answers a
 * different question — "what do I have to do next, and can I do it" — and
 * every field below exists to make one thing on the card true.
 *
 * The two are not merged behind a flag because they do not share a middle:
 * the shape a table wants and the shape a card wants disagree at every
 * field, and a query returning both grows a boolean for each of them.
 */

/** Open means still ours to do something about. */
export const CLOSED_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

export type OrderProblem = { severity: "block" | "warn"; text: string };

export type SellerOrder = {
  id: string;
  orderNumber: string;
  createdAt: Date;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  total: number;
  customerName: string;
  customerPhone: string | null;
  /** Delivery, and where to — or collection from the shop. */
  delivery: { toCustomer: boolean; address: string | null; fee: number };
  items: { title: string; sku: string; quantity: number; inStock: number | null }[];
  problems: OrderProblem[];
};

type Row = Awaited<ReturnType<typeof fetchRows>>[number];

function fetchRows(where: object) {
  return db.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
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
          product: { select: { stockQty: true, isPublished: true } },
        },
      },
    },
  });
}

export async function getSellerOrders(closed: boolean): Promise<SellerOrder[]> {
  const rows = await fetchRows(
    closed ? { status: { in: CLOSED_STATUSES } } : { status: { notIn: CLOSED_STATUSES } },
  );
  return rows.map(toSellerOrder);
}

export async function getSellerOrder(orderNumber: string): Promise<SellerOrder | null> {
  const rows = await fetchRows({ orderNumber });
  return rows[0] ? toSellerOrder(rows[0]) : null;
}

function toSellerOrder(row: Row): SellerOrder {
  const toCustomer = row.deliveryMethod === "DELIVERY";
  const address = [row.shipStreet, row.shipHouseNo, row.shipApartment && `דירה ${row.shipApartment}`, row.shipCity]
    .filter(Boolean)
    .join(" ");

  const items = row.items.map((item) => ({
    title: item.titleSnap,
    sku: item.skuSnap,
    quantity: item.quantity,
    inStock: item.product ? item.product.stockQty : null,
  }));

  const problems: OrderProblem[] = [];

  // A delivery order with nowhere to deliver it. This is the one that used to
  // reach the back office silently — see the shipCity comment in schema.prisma
  // — and it is the reason the card leads with the address rather than
  // mentioning it somewhere below the fold.
  if (toCustomer && !address) {
    problems.push({ severity: "block", text: "הזמנת משלוח בלי כתובת — צריך להתקשר ללקוח" });
  }
  if (!row.guestPhone && !row.user?.phone) {
    problems.push({ severity: "block", text: "אין טלפון ליצירת קשר" });
  }

  // Stock is read now, not from the order. What matters to the person picking
  // it is what is on the shelf today, and an order placed while the last unit
  // was still listed is exactly the case worth showing.
  for (const item of items) {
    if (item.inStock === null) {
      problems.push({ severity: "warn", text: `${item.title} — המוצר לא קיים יותר בקטלוג` });
    } else if (item.inStock < item.quantity) {
      problems.push({
        severity: "block",
        text: `${item.title} — הוזמנו ${item.quantity}, במלאי ${item.inStock}`,
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
    items,
    problems,
  };
}
