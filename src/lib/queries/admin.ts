import "server-only";
import { db } from "@/lib/db";

const ATTENTION_STATUSES = ["PROCESSING", "AWAITING_SUPPLIER"];

export async function getDashboardStats() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sevenDaysAgo = new Date(now.getTime() - 7 * 86400000);
  const threeDaysAgo = new Date(now.getTime() - 3 * 86400000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

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
    soldItems,
  ] = await Promise.all([
    /* The three counts that are "how much work is there" skip the bin — an
       order somebody binned is one they have decided is not work. The money
       figures below do not need the filter: only an order that took no real
       money can be binned at all, so none of them is ever CAPTURED. */
    db.order.count({ where: { createdAt: { gte: startOfToday }, deletedAt: null } }),
    db.order.aggregate({ where: { createdAt: { gte: startOfToday }, paymentStatus: "CAPTURED" }, _sum: { total: true } }),
    db.order.count({ where: { status: { in: ["NEW", "PAYMENT_PENDING", "PAID"] }, deletedAt: null } }),
    db.order.count({ where: { status: "CANCELLED", createdAt: { gte: sevenDaysAgo } } }),
    db.order.count({ where: { status: { in: ["REFUND_PENDING", "REFUNDED"] }, createdAt: { gte: sevenDaysAgo } } }),
    db.order.findMany({
      where: { createdAt: { gte: sevenDaysAgo } },
      select: { createdAt: true, total: true, paymentStatus: true },
    }),
    db.order.findMany({ where: { paymentStatus: "CAPTURED" }, select: { total: true } }),
    db.order.findMany({
      where: { status: { in: ATTENTION_STATUSES }, createdAt: { lte: threeDaysAgo }, deletedAt: null },
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
    /* Every line sold in the last 30 days, with the price and the cost the
       day it was ordered. Profit is read off the snapshots and never off
       today's catalogue — the price list moves twice a day. */
    db.orderItem.findMany({
      where: { order: { paymentStatus: "CAPTURED", createdAt: { gte: thirtyDaysAgo } } },
      select: {
        priceSnap: true,
        costSnap: true,
        quantity: true,
        order: { select: { id: true, createdAt: true, discountTotal: true } },
      },
    }),
  ]);

  /* Gross profit per window: what the goods sold for, minus the discounts
     given, minus what the goods cost. Delivery income and the carrier's
     bill are both left out — the fee is a pass-through at best — and so are
     the clearing fee and VAT on the margin, which the tile says. A line
     whose product had no cost on record is counted in revenue and reported
     as missing rather than silently treated as free. */
  const profitWindow = (since: Date) => {
    const orders = new Map<string, number>();
    let revenue = 0;
    let cost = 0;
    let missing = 0;
    for (const line of soldItems) {
      if (line.order.createdAt < since) continue;
      orders.set(line.order.id, line.order.discountTotal);
      revenue += line.priceSnap * line.quantity;
      if (line.costSnap === null) missing += 1;
      else cost += line.costSnap * line.quantity;
    }
    const discount = [...orders.values()].reduce((s, d) => s + d, 0);
    return { revenue, discount, cost, missing, orders: orders.size, profit: revenue - discount - cost };
  };
  const profit = {
    today: profitWindow(startOfToday),
    week: profitWindow(sevenDaysAgo),
    month: profitWindow(thirtyDaysAgo),
  };

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
    label: new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "short" }).format(new Date(date)),
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
    profit,
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
