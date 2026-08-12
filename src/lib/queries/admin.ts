import "server-only";
import { db } from "@/lib/db";

const ATTENTION_STATUSES = ["PROCESSING", "AWAITING_SUPPLIER"];

export async function getDashboardStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);

  const [
    ordersToday,
    revenueTodayAgg,
    pendingOrders,
    cancellations,
    refunds,
    last7DaysOrders,
    allOrdersForAov,
    attentionOrders,
    topProducts,
    categoryRows,
  ] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: startOfToday } } }),
    db.order.aggregate({ where: { createdAt: { gte: startOfToday }, paymentStatus: "CAPTURED" }, _sum: { total: true } }),
    db.order.count({ where: { status: { in: ["NEW", "PAYMENT_PENDING", "PAID"] } } }),
    db.order.count({ where: { status: "CANCELLED", createdAt: { gte: sevenDaysAgo } } }),
    db.order.count({ where: { status: { in: ["REFUND_PENDING", "REFUNDED"] }, createdAt: { gte: sevenDaysAgo } } }),
    db.order.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true, paymentStatus: true },
    }),
    db.order.findMany({ where: { paymentStatus: "CAPTURED" }, select: { total: true } }),
    db.order.findMany({
      where: { status: { in: ATTENTION_STATUSES }, createdAt: { lte: threeDaysAgo } },
      orderBy: { createdAt: "asc" },
      take: 10,
    }),
    db.orderItem.groupBy({
      by: ["productId", "titleSnap"],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    db.category.findMany({
      where: { parentId: null },
      include: { children: { include: { _count: { select: { products: true } } } } },
    }),
  ]);

  const dayBuckets = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    dayBuckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const o of last7DaysOrders) {
    if (o.paymentStatus !== "CAPTURED") continue;
    const key = o.createdAt.toISOString().slice(0, 10);
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + o.total);
  }
  const revenueByDay = Array.from(dayBuckets.entries()).map(([date, total]) => ({
    date,
    label: new Intl.DateTimeFormat("he-IL", { weekday: "short" }).format(new Date(date)),
    total,
  }));

  const avgOrderValue =
    allOrdersForAov.length > 0 ? allOrdersForAov.reduce((s, o) => s + o.total, 0) / allOrdersForAov.length : 0;

  const categoryPerformance = categoryRows
    .map((dept) => ({
      name: dept.name,
      productCount: dept.children.reduce((s, c) => s + c._count.products, 0),
    }))
    .filter((c) => c.productCount > 0)
    .sort((a, b) => b.productCount - a.productCount)
    .slice(0, 6);

  return {
    ordersToday,
    revenueToday: revenueTodayAgg._sum.total ?? 0,
    pendingOrders,
    cancellations,
    refunds,
    avgOrderValue,
    revenueByDay,
    attentionOrders,
    topProducts: topProducts.map((p) => ({ title: p.titleSnap, qty: p._sum.quantity ?? 0 })),
    categoryPerformance,
  };
}
