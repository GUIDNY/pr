import "server-only";
import { db } from "@/lib/db";
import { CLOSED_COMPLAINT_STATUSES, type ComplaintCategory } from "@/lib/enums";
import { getComplaints, type ComplaintFilters } from "@/lib/queries/admin-complaints";

/* The complaints inbox: what the list and the KPI row need on top of
   getComplaints, read without any schema change. Everything here is derived
   from Complaint and ComplaintMessage as they already are. */

const DAY = 24 * 60 * 60 * 1000;

/** Midnight in Israel today, with the offset that applies today (+02:00 in
    winter, +03:00 in summer). */
function startOfTodayInIsrael(): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Jerusalem",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZoneName: "longOffset",
    })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  const offset = (parts.timeZoneName ?? "GMT+02:00").replace("GMT", "") || "+00:00";
  return new Date(`${parts.year}-${parts.month}-${parts.day}T00:00:00${offset}`);
}

/** Categories that are about something already bought. A thread outside
    these that names a model we sell is a question before a sale. */
const AFTER_SALE: ComplaintCategory[] = [
  "PRODUCT_DEFECT",
  "DELIVERY_DELAY",
  "DELIVERY_DAMAGE",
  "WRONG_ITEM",
  "MISSING_ITEM",
  "BILLING",
  "RETURN_REFUND",
];

/** Model-looking tokens: letters and digits together, five characters or
    more, the way a customer pastes "SMS4ECW28E" or "HDR5818W". */
function modelTokens(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/[A-Za-z0-9][A-Za-z0-9\-/.]{3,}[A-Za-z0-9]/g)) {
    const t = m[0];
    if (/\d/.test(t) && /[A-Za-z]/.test(t)) out.add(t.toUpperCase());
  }
  return [...out];
}

export type InboxProduct = { title: string; price: number; slug: string; model: string };

/** The products a set of threads mention by model, keyed by complaint id. */
async function mentionedProducts(texts: Map<string, string>): Promise<Map<string, InboxProduct>> {
  const tokensById = new Map<string, string[]>();
  const all = new Set<string>();
  for (const [id, text] of texts) {
    const tokens = modelTokens(text);
    tokensById.set(id, tokens);
    tokens.forEach((t) => all.add(t));
  }
  if (all.size === 0) return new Map();
  const products = await db.product.findMany({
    where: { model: { in: [...all], mode: "insensitive" } },
    select: { title: true, price: true, slug: true, model: true, isPublished: true },
    orderBy: { isPublished: "desc" },
  });
  const byModel = new Map<string, InboxProduct>();
  for (const p of products) {
    const key = p.model!.toUpperCase();
    if (!byModel.has(key)) byModel.set(key, { title: p.title, price: p.price, slug: p.slug, model: p.model! });
  }
  const out = new Map<string, InboxProduct>();
  for (const [id, tokens] of tokensById) {
    const hit = tokens.map((t) => byModel.get(t)).find(Boolean);
    if (hit) out.set(id, hit);
  }
  return out;
}

export type InboxItem = Awaited<ReturnType<typeof getInboxList>>[number];

/** The list: getComplaints' filtering, newest message first, plus the last
    thing the customer said, whether the last word is still theirs, and the
    product the thread names. */
export async function getInboxList(filters: ComplaintFilters, { closedOnly = false } = {}) {
  const rows = (await getComplaints(filters))
    .filter((r) => !closedOnly || CLOSED_COMPLAINT_STATUSES.includes(r.status as never))
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const [lastCustomer, lastSpoken, customerTexts] = await Promise.all([
    db.complaintMessage.findMany({
      where: { complaintId: { in: ids }, role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      distinct: ["complaintId"],
      select: { complaintId: true, body: true, createdAt: true },
    }),
    db.complaintMessage.findMany({
      where: { complaintId: { in: ids }, role: { in: ["CUSTOMER", "STAFF"] } },
      orderBy: { createdAt: "desc" },
      distinct: ["complaintId"],
      select: { complaintId: true, role: true },
    }),
    db.complaintMessage.findMany({
      where: { complaintId: { in: ids }, role: "CUSTOMER" },
      orderBy: { createdAt: "desc" },
      take: 1500,
      select: { complaintId: true, body: true },
    }),
  ]);

  const lastCustomerBy = new Map(lastCustomer.map((m) => [m.complaintId, m]));
  const lastSpokenBy = new Map(lastSpoken.map((m) => [m.complaintId, m.role]));
  const texts = new Map(rows.map((r) => [r.id, r.subject]));
  for (const m of customerTexts) texts.set(m.complaintId, `${texts.get(m.complaintId) ?? ""} ${m.body}`);
  const products = await mentionedProducts(texts);

  return rows.map((r) => {
    const open = !CLOSED_COMPLAINT_STATUSES.includes(r.status as never);
    return {
      ...r,
      lastCustomerBody: lastCustomerBy.get(r.id)?.body ?? null,
      // Ours to answer: still open, and the last person to speak was the
      // customer (a bot reply does not count — it is why there is a thread).
      awaitingUs: open && (lastSpokenBy.get(r.id) ?? "CUSTOMER") === "CUSTOMER",
      product: products.get(r.id) ?? null,
    };
  });
}

/** The KPI row and the status chips' counters. */
export async function getInboxStats() {
  const now = Date.now();
  const since30 = new Date(now - 30 * DAY);
  const today = startOfTodayInIsrael();

  const [byStatus, last30, todayCount, closed30, openRows] = await Promise.all([
    db.complaint.groupBy({ by: ["status"], _count: { _all: true } }),
    db.complaint.findMany({
      where: { firstMessageAt: { gte: since30 } },
      select: { id: true, subject: true, category: true },
    }),
    db.complaint.count({ where: { firstMessageAt: { gte: today } } }),
    db.complaint.count({ where: { resolvedAt: { gte: since30 } } }),
    db.complaint.findMany({
      where: { status: { notIn: CLOSED_COMPLAINT_STATUSES } },
      select: { id: true },
    }),
  ]);

  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  const total = byStatus.reduce((n, b) => n + b._count._all, 0);
  const closed = CLOSED_COMPLAINT_STATUSES.reduce((n, s) => n + count(s), 0);

  const openIds = openRows.map((r) => r.id);
  const lastSpoken = openIds.length
    ? await db.complaintMessage.findMany({
        where: { complaintId: { in: openIds }, role: { in: ["CUSTOMER", "STAFF"] } },
        orderBy: { createdAt: "desc" },
        distinct: ["complaintId"],
        select: { role: true },
      })
    : [];
  const awaitingUs = lastSpoken.filter((m) => m.role === "CUSTOMER").length + (openIds.length - lastSpoken.length);

  const presale = last30.filter((c) => !AFTER_SALE.includes(c.category as ComplaintCategory));
  const presaleTexts = new Map(presale.map((c) => [c.id, c.subject]));
  if (presale.length) {
    const msgs = await db.complaintMessage.findMany({
      where: { complaintId: { in: presale.map((c) => c.id) }, role: "CUSTOMER" },
      select: { complaintId: true, body: true },
      take: 2000,
    });
    for (const m of msgs) presaleTexts.set(m.complaintId, `${presaleTexts.get(m.complaintId) ?? ""} ${m.body}`);
  }
  const potentialSale = (await mentionedProducts(presaleTexts)).size;

  return {
    last30: last30.length,
    today: todayCount,
    open: openIds.length,
    awaitingUs,
    closed30,
    potentialSale,
    chips: {
      ALL: total,
      OPEN: count("OPEN"),
      IN_PROGRESS: count("IN_PROGRESS"),
      WAITING_CUSTOMER: count("WAITING_CUSTOMER"),
      CLOSED: closed,
    },
  };
}
