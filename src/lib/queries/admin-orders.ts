import "server-only";
import { db } from "@/lib/db";
import { ORDER_STALE_AFTER_HOURS, type OrderStatus } from "@/lib/enums";

export type AdminOrderFilters = {
  search?: string;
  status?: OrderStatus | "ALL";
  assignedToId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export async function getAdminOrders(filters: AdminOrderFilters) {
  const where: Record<string, unknown> = {};

  if (filters.status && filters.status !== "ALL") where.status = filters.status;
  if (filters.assignedToId) where.assignedToId = filters.assignedToId;
  if (filters.dateFrom || filters.dateTo) {
    where.createdAt = {
      ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
      ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59`) } : {}),
    };
  }
  if (filters.search) {
    const s = filters.search.trim();
    where.OR = [
      { orderNumber: { contains: s, mode: "insensitive" } },
      { guestName: { contains: s, mode: "insensitive" } },
      { guestPhone: { contains: s } },
      { guestEmail: { contains: s, mode: "insensitive" } },
      { user: { name: { contains: s, mode: "insensitive" } } },
      { user: { phone: { contains: s } } },
      { user: { email: { contains: s, mode: "insensitive" } } },
    ];
  }

  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const [orders, total] = await Promise.all([
    db.order.findMany({
      where,
      include: { user: true, items: true, assignedTo: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.order.count({ where }),
  ]);

  // How long each order has sat where it is, worked out here rather than in
  // the page: reading the clock is not something a render is allowed to do,
  // and the shop's patience for each status is a rule about the business, not
  // about the table that displays it. Measured from the last change, not from
  // when the order was placed — an order moved forward this morning is being
  // handled, however old it is.
  const now = Date.now();
  const withAge = orders.map((order) => {
    const hoursInStatus = (now - order.updatedAt.getTime()) / 3_600_000;
    const staleAfter = ORDER_STALE_AFTER_HOURS[order.status as OrderStatus] ?? null;
    return {
      ...order,
      hoursInStatus,
      isStale: staleAfter !== null && hoursInStatus > staleAfter,
    };
  });

  return { orders: withAge, total };
}

/**
 * How many orders sit in each status right now, so the filter bar can say
 * where the work is instead of making someone open every status in turn to
 * find out. Counted across the whole table, deliberately ignoring the current
 * filters: these are the numbers you navigate BY.
 */
export async function getAdminOrderStatusCounts() {
  const rows = await db.order.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of rows) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }
  return { counts, total };
}

export async function getAdminOrderDetail(orderNumber: string) {
  return db.order.findUnique({
    where: { orderNumber },
    include: {
      user: true,
      address: true,
      items: { include: { product: { select: { slug: true, images: { take: 1 } } } } },
      payments: { orderBy: { createdAt: "desc" } },
      statusHistory: { include: { changedBy: true }, orderBy: { createdAt: "desc" } },
      notes: { include: { author: true }, orderBy: { createdAt: "desc" } },
      assignedTo: true,
      supplier: true,
    },
  });
}

export async function getStaffUsers() {
  return db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] } }, orderBy: { name: "asc" } });
}
