import "server-only";
import { db } from "@/lib/db";
import { channelOfOrder, CHANNELS, type Channel } from "@/lib/admin/order-channel";
import { cumulative, dayKeys, shiftKey } from "@/lib/admin/trend-math";

/**
 * The dashboard's "are we improving" numbers. Reads only, and aggregates in
 * SQL: nothing here loads a PageView or a VisitEvent into memory.
 *
 * An ORDER, throughout, is one that was paid (paymentStatus CAPTURED) and is
 * not cancelled, not in the bin and not deleted by the owner. That is the
 * same revenue the existing tiles use, minus the cancelled ones, so the
 * trend and the tiles agree on what a sale is.
 *
 * Days are Israel days. Order.createdAt is a UTC timestamp without a zone,
 * so every bucket goes through `(x AT TIME ZONE 'UTC') AT TIME ZONE
 * 'Asia/Jerusalem'` first; bucketing on the raw value moves the evening's
 * orders into the next day.
 *
 * Every query string below is a constant. Nothing a visitor or an admin
 * typed is ever interpolated; the only variable is `days`, a number the page
 * has already clamped to 7, 30 or 90.
 */

const LOCAL = (col: string) => `(${col} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem'`;
const REAL_ORDER = `o."paymentStatus" = 'CAPTURED' AND o."status" <> 'CANCELLED' AND o."deletedAt" IS NULL AND o."ownerDeletedAt" IS NULL`;
const NOW_LOCAL = `(now() AT TIME ZONE 'Asia/Jerusalem')`;
const TODAY0 = `date_trunc('day', ${NOW_LOCAL})`;

export type Kpi = { cur: number; prev: number };
export type KpiPeriod = { orders: Kpi; revenue: Kpi; aov: Kpi; profit: Kpi; missingCost: number };
export type KpiComparison = { today: KpiPeriod; week: KpiPeriod; month: KpiPeriod };

/* [current, previous] windows, in Israel local time.
   today: so far, against the same weekday last week up to the same moment —
   a whole finished Tuesday against a Tuesday that is still going would
   always read as a drop until evening. */
const WINDOWS: Record<"today" | "week" | "month", [string, string]> = {
  today: [`{ts} >= ${TODAY0}`, `{ts} >= ${TODAY0} - interval '7 days' AND {ts} <= ${NOW_LOCAL} - interval '7 days'`],
  week: [
    `{ts} >= ${TODAY0} - interval '6 days'`,
    `{ts} >= ${TODAY0} - interval '13 days' AND {ts} < ${TODAY0} - interval '6 days'`,
  ],
  month: [
    `{ts} >= ${TODAY0} - interval '29 days'`,
    `{ts} >= ${TODAY0} - interval '59 days' AND {ts} < ${TODAY0} - interval '29 days'`,
  ],
};

export async function getKpiComparison(): Promise<KpiComparison> {
  const ts = LOCAL('o."createdAt"');
  const cols: string[] = [];
  for (const [name, [cur, prev]] of Object.entries(WINDOWS)) {
    for (const [side, cond] of [["cur", cur], ["prev", prev]] as const) {
      const c = cond.replaceAll("{ts}", ts);
      cols.push(
        `(count(*) FILTER (WHERE ${c}))::int AS "${name}_${side}_orders"`,
        `COALESCE(sum(o."total") FILTER (WHERE ${c}), 0)::float8 AS "${name}_${side}_revenue"`,
        `COALESCE(sum(o."discountTotal") FILTER (WHERE ${c}), 0)::float8 AS "${name}_${side}_discount"`,
      );
    }
  }
  const orderRows = await db.$queryRawUnsafe<Record<string, number>[]>(
    `SELECT ${cols.join(", ")} FROM "Order" o WHERE ${REAL_ORDER} AND o."createdAt" >= now() - interval '62 days'`,
  );

  const icols: string[] = [];
  for (const [name, [cur, prev]] of Object.entries(WINDOWS)) {
    for (const [side, cond] of [["cur", cur], ["prev", prev]] as const) {
      const c = cond.replaceAll("{ts}", ts);
      icols.push(
        `COALESCE(sum(i."priceSnap" * i."quantity") FILTER (WHERE ${c}), 0)::float8 AS "${name}_${side}_goods"`,
        `COALESCE(sum(i."costSnap" * i."quantity") FILTER (WHERE ${c} AND i."costSnap" IS NOT NULL), 0)::float8 AS "${name}_${side}_cost"`,
        `(count(*) FILTER (WHERE ${c} AND i."costSnap" IS NULL))::int AS "${name}_${side}_missing"`,
      );
    }
  }
  const itemRows = await db.$queryRawUnsafe<Record<string, number>[]>(
    `SELECT ${icols.join(", ")} FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId" WHERE ${REAL_ORDER} AND o."createdAt" >= now() - interval '62 days'`,
  );
  const o = orderRows[0] ?? {};
  const it = itemRows[0] ?? {};

  const period = (name: "today" | "week" | "month"): KpiPeriod => {
    const side = (s: "cur" | "prev") => {
      const orders = Number(o[`${name}_${s}_orders`] ?? 0);
      const revenue = Number(o[`${name}_${s}_revenue`] ?? 0);
      const discount = Number(o[`${name}_${s}_discount`] ?? 0);
      const goods = Number(it[`${name}_${s}_goods`] ?? 0);
      const cost = Number(it[`${name}_${s}_cost`] ?? 0);
      return { orders, revenue, aov: orders > 0 ? revenue / orders : 0, profit: goods - discount - cost };
    };
    const c = side("cur");
    const p = side("prev");
    return {
      orders: { cur: c.orders, prev: p.orders },
      revenue: { cur: c.revenue, prev: p.revenue },
      aov: { cur: c.aov, prev: p.aov },
      profit: { cur: c.profit, prev: p.profit },
      missingCost: Number(it[`${name}_cur_missing`] ?? 0),
    };
  };
  return { today: period("today"), week: period("week"), month: period("month") };
}

export type TrendPoint = {
  date: string;
  label: string;
  revenue: number;
  orders: number;
  prevRevenue: number;
  prevOrders: number;
  profit: number;
  profitCum: number;
};

const dayLabel = (key: string) => `${key.slice(8, 10)}/${key.slice(5, 7)}`;

/** One row per Israel day for the chosen range and the equal range before it. */
export async function getTrend(days: number): Promise<{ points: TrendPoint[]; missingCost: number }> {
  const ts = LOCAL('o."createdAt"');
  const span = days * 2;
  const [orderDays, itemDays, todayRow] = await Promise.all([
    db.$queryRawUnsafe<{ d: string; orders: number; revenue: number; discount: number }[]>(
      `SELECT to_char(date_trunc('day', ${ts}), 'YYYY-MM-DD') AS d, count(*)::int AS orders,
              COALESCE(sum(o."total"), 0)::float8 AS revenue, COALESCE(sum(o."discountTotal"), 0)::float8 AS discount
         FROM "Order" o
        WHERE ${REAL_ORDER} AND o."createdAt" >= now() - interval '${span + 1} days'
          AND ${ts} >= ${TODAY0} - interval '${span - 1} days'
        GROUP BY 1`,
    ),
    db.$queryRawUnsafe<{ d: string; goods: number; cost: number; missing: number }[]>(
      `SELECT to_char(date_trunc('day', ${ts}), 'YYYY-MM-DD') AS d,
              COALESCE(sum(i."priceSnap" * i."quantity"), 0)::float8 AS goods,
              COALESCE(sum(i."costSnap" * i."quantity") FILTER (WHERE i."costSnap" IS NOT NULL), 0)::float8 AS cost,
              (count(*) FILTER (WHERE i."costSnap" IS NULL))::int AS missing
         FROM "OrderItem" i JOIN "Order" o ON o."id" = i."orderId"
        WHERE ${REAL_ORDER} AND o."createdAt" >= now() - interval '${span + 1} days'
          AND ${ts} >= ${TODAY0} - interval '${span - 1} days'
        GROUP BY 1`,
    ),
    db.$queryRawUnsafe<{ d: string }[]>(`SELECT to_char(${TODAY0}, 'YYYY-MM-DD') AS d`),
  ]);
  const today = todayRow[0].d;
  const byOrder = new Map(orderDays.map((r) => [r.d, r]));
  const byItem = new Map(itemDays.map((r) => [r.d, r]));
  const keys = dayKeys(today, days);

  const profits = keys.map((k) => {
    const od = byOrder.get(k);
    const id = byItem.get(k);
    return (id?.goods ?? 0) - (od?.discount ?? 0) - (id?.cost ?? 0);
  });
  const cum = cumulative(profits);
  const points = keys.map((k, i): TrendPoint => {
    const prevKey = shiftKey(k, -days);
    return {
      date: k,
      label: dayLabel(k),
      revenue: byOrder.get(k)?.revenue ?? 0,
      orders: byOrder.get(k)?.orders ?? 0,
      prevRevenue: byOrder.get(prevKey)?.revenue ?? 0,
      prevOrders: byOrder.get(prevKey)?.orders ?? 0,
      profit: profits[i],
      profitCum: cum[i],
    };
  });
  const missingCost = keys.reduce((s, k) => s + (byItem.get(k)?.missing ?? 0), 0);
  return { points, missingCost };
}

export type FunnelBucket = {
  key: string;
  label: string;
  visitors: number;
  addToCart: number;
  checkout: number;
  payment: number;
  orders: number;
  rate: number | null;
};

/** The funnel per day or per week. The visit log is anonymous (a visit id
    that lapses within a day), so each stage is a distinct-visit count. Bots
    and the back office are out. Weeks start on Sunday, as in Israel. */
export async function getFunnel(days: number, grain: "day" | "week"): Promise<FunnelBucket[]> {
  const evTs = LOCAL('e."createdAt"');
  const orTs = LOCAL('o."createdAt"');
  const bucket = (ts: string) =>
    grain === "day"
      ? `date_trunc('day', ${ts})`
      : `(date_trunc('week', ${ts} + interval '1 day') - interval '1 day')`;
  const [events, orders] = await Promise.all([
    db.$queryRawUnsafe<{ b: string; visitors: number; atc: number; chk: number; pay: number }[]>(
      `SELECT to_char(${bucket(evTs)}, 'YYYY-MM-DD') AS b,
              (count(DISTINCT e."sid") FILTER (WHERE e."type" = 'consent_shown'))::int AS visitors,
              (count(DISTINCT e."sid") FILTER (WHERE e."type" = 'add_to_cart_click'))::int AS atc,
              (count(DISTINCT e."sid") FILTER (WHERE e."type" = 'checkout_start'))::int AS chk,
              (count(DISTINCT e."sid") FILTER (WHERE e."type" = 'payment_submit'))::int AS pay
         FROM "VisitEvent" e
        WHERE e."isBot" = false AND e."path" NOT LIKE '/admin%'
          AND e."type" IN ('consent_shown','add_to_cart_click','checkout_start','payment_submit')
          AND e."createdAt" >= now() - interval '${days + 8} days'
          AND ${evTs} >= ${TODAY0} - interval '${days - 1} days'
        GROUP BY 1 ORDER BY 1`,
    ),
    db.$queryRawUnsafe<{ b: string; orders: number }[]>(
      `SELECT to_char(${bucket(orTs)}, 'YYYY-MM-DD') AS b, count(*)::int AS orders
         FROM "Order" o
        WHERE ${REAL_ORDER} AND o."createdAt" >= now() - interval '${days + 8} days'
          AND ${orTs} >= ${TODAY0} - interval '${days - 1} days'
        GROUP BY 1`,
    ),
  ]);
  const ordersBy = new Map(orders.map((r) => [r.b, r.orders]));
  const keys = new Set([...events.map((e) => e.b), ...ordersBy.keys()]);
  const evBy = new Map(events.map((e) => [e.b, e]));
  return [...keys].sort().map((k) => {
    const e = evBy.get(k);
    const visitors = e?.visitors ?? 0;
    const n = ordersBy.get(k) ?? 0;
    return {
      key: k,
      label: dayLabel(k),
      visitors,
      addToCart: e?.atc ?? 0,
      checkout: e?.chk ?? 0,
      payment: e?.pay ?? 0,
      orders: n,
      rate: visitors > 0 ? Math.round((n / visitors) * 1000) / 10 : null,
    };
  });
}

export type ChannelRow = { channel: Channel; orders: number; revenue: number };
export type ChannelWeek = { key: string; label: string } & Record<Channel, number>;

/** Orders by source, from Order.attribution. The JSON is classified in code
    (lib/admin/order-channel.ts) because the cookie's source is free text;
    the rows are one per order in the range, never PageView. */
export async function getChannels(days: number, which: "first" | "last") {
  const ts = LOCAL('o."createdAt"');
  const rows = await db.$queryRawUnsafe<{ d: string; total: number; attribution: unknown }[]>(
    `SELECT to_char(date_trunc('day', ${ts}), 'YYYY-MM-DD') AS d, o."total"::float8 AS total, o."attribution" AS attribution
       FROM "Order" o
      WHERE ${REAL_ORDER} AND o."createdAt" >= now() - interval '${days + 2} days'
        AND ${ts} >= ${TODAY0} - interval '${days - 1} days'`,
  );
  const totals = new Map<Channel, ChannelRow>(CHANNELS.map((c) => [c, { channel: c, orders: 0, revenue: 0 }]));
  const weeks = new Map<string, ChannelWeek>();
  for (const r of rows) {
    const ch = channelOfOrder(r.attribution, which);
    const t = totals.get(ch)!;
    t.orders += 1;
    t.revenue += r.total;
    /* Sunday of the order's week. */
    const dt = new Date(`${r.d}T00:00:00Z`);
    const sunday = shiftKey(r.d, -dt.getUTCDay());
    let w = weeks.get(sunday);
    if (!w) {
      w = { key: sunday, label: dayLabel(sunday), ...Object.fromEntries(CHANNELS.map((c) => [c, 0])) } as ChannelWeek;
      weeks.set(sunday, w);
    }
    w[ch] += 1;
  }
  return {
    totals: [...totals.values()].filter((t) => t.orders > 0).sort((a, b) => b.revenue - a.revenue),
    weeks: [...weeks.values()].sort((a, b) => a.key.localeCompare(b.key)),
  };
}
