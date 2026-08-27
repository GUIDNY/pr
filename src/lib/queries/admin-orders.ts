import "server-only";
import { db } from "@/lib/db";
import type { OrderStatus } from "@/lib/enums";

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

  return { orders, total };
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
