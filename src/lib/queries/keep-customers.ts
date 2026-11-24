import "server-only";
import { db } from "@/lib/db";

export type KeepCustomer = {
  key: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  titles: string[];
  amount: number;
  attempts: number;
  lastAt: Date;
  notes: { at: Date; author: string; body: string }[];
  reason: "תשלום נכשל" | "לא השלים תשלום" | "עגלה נטושה";
};

const DAYS = 14;
const digits = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");
/** One customer however they were reached: last 9 digits of the phone, else email, else account. */
export function customerKey(phone?: string | null, email?: string | null, userId?: string | null): string | null {
  const p = digits(phone);
  if (p.length >= 9) return `p:${p.slice(-9)}`;
  if (email?.trim()) return `e:${email.trim().toLowerCase()}`;
  if (userId) return `u:${userId}`;
  return null;
}

type Attempt = {
  at: Date;
  kind: "FAILED" | "PENDING" | "CART";
  name: string | null;
  phone: string | null;
  email: string | null;
  products: { id: string; title: string }[];
  amount: number;
};

/**
 * Customers worth not losing: unfinished payments and abandoned carts, one
 * row per customer. Someone who later paid for the same product is not
 * listed; someone marked handled stays off until a newer attempt. The owner's
 * own test phone (PR-880418) never appears. The key is the dismissal record
 * in AuditLog (KEEP_CUSTOMER_DISMISSED), so no table is needed.
 */
export async function getKeepCustomers(): Promise<KeepCustomer[]> {
  const since = new Date(Date.now() - DAYS * 86_400_000);
  const [orders, carts, dismissals, ownerOrder] = await Promise.all([
    db.order.findMany({
      where: { createdAt: { gte: since }, deletedAt: null, status: { notIn: ["CANCELLED", "REFUNDED"] } },
      select: {
        createdAt: true,
        status: true,
        paymentStatus: true,
        total: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        guestPhone: true,
        user: { select: { name: true, email: true, phone: true } },
        items: { select: { productId: true, titleSnap: true } },
      },
    }),
    db.cart.findMany({
      where: { contactAt: { gte: since }, followUpStatus: "NEW", items: { some: {} } },
      select: {
        contactAt: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        userId: true,
        items: { select: { quantity: true, product: { select: { id: true, title: true, price: true } } } },
      },
    }),
    db.auditLog.findMany({
      where: { action: "KEEP_CUSTOMER_DISMISSED" },
      orderBy: { createdAt: "desc" },
      select: { entityId: true, createdAt: true },
    }),
    db.order.findUnique({ where: { orderNumber: "PR-880418" }, select: { guestPhone: true } }),
  ]);

  const ownerKey = customerKey(ownerOrder?.guestPhone);
  const dismissedAt = new Map<string, Date>();
  for (const d of dismissals) if (!dismissedAt.has(d.entityId)) dismissedAt.set(d.entityId, d.createdAt);

  const attempts = new Map<string, Attempt[]>();
  const paid = new Map<string, { at: Date; ids: Set<string> }[]>();
  const push = <T,>(m: Map<string, T[]>, k: string, v: T) => m.set(k, [...(m.get(k) ?? []), v]);

  for (const o of orders) {
    const key = customerKey(o.guestPhone ?? o.user?.phone, o.guestEmail ?? o.user?.email, o.userId);
    if (!key || key === ownerKey) continue;
    const ids = o.items.map((i) => i.productId);
    if (["AUTHORIZED", "CAPTURED"].includes(o.paymentStatus)) {
      push(paid, key, { at: o.createdAt, ids: new Set(ids) });
    } else if (o.status === "PAYMENT_PENDING" || o.status === "PAYMENT_FAILED") {
      push(attempts, key, {
        at: o.createdAt,
        kind: o.status === "PAYMENT_FAILED" ? "FAILED" : "PENDING",
        name: o.guestName ?? o.user?.name ?? null,
        phone: o.guestPhone ?? o.user?.phone ?? null,
        email: o.guestEmail ?? o.user?.email ?? null,
        products: o.items.map((i) => ({ id: i.productId, title: i.titleSnap })),
        amount: o.total,
      });
    }
  }
  for (const c of carts) {
    const key = customerKey(c.contactPhone, c.contactEmail, c.userId);
    if (!key || key === ownerKey || !c.contactAt) continue;
    push(attempts, key, {
      at: c.contactAt,
      kind: "CART",
      name: c.contactName,
      phone: c.contactPhone,
      email: c.contactEmail,
      products: c.items.map((i) => ({ id: i.product.id, title: i.product.title })),
      amount: c.items.reduce((s, i) => s + i.product.price * i.quantity, 0),
    });
  }

  const noteRows = await db.auditLog.findMany({
    where: { action: "KEEP_CUSTOMER_NOTE", entityId: { in: [...attempts.keys()] } },
    orderBy: { createdAt: "desc" },
    select: { entityId: true, createdAt: true, metadata: true, actor: { select: { name: true } } },
  });
  const notesBy = new Map<string, KeepCustomer["notes"]>();
  for (const n of noteRows) {
    let body = "";
    try {
      body = String((JSON.parse(n.metadata ?? "{}") as { body?: string }).body ?? "");
    } catch {}
    if (body) push(notesBy, n.entityId, { at: n.createdAt, author: n.actor?.name ?? "—", body });
  }

  const out: KeepCustomer[] = [];
  for (const [key, list] of attempts) {
    const open = list.filter((a) => !(paid.get(key) ?? []).some((p) => p.at >= a.at && a.products.some((x) => p.ids.has(x.id))));
    if (open.length === 0) continue;
    open.sort((a, b) => b.at.getTime() - a.at.getTime());
    const last = open[0];
    const dismissed = dismissedAt.get(key);
    if (dismissed && dismissed >= last.at) continue;
    const kinds = new Set(open.map((a) => a.kind));
    out.push({
      key,
      name: open.find((a) => a.name)?.name ?? null,
      phone: open.find((a) => a.phone)?.phone ?? null,
      email: open.find((a) => a.email)?.email ?? null,
      titles: [...new Set(last.products.map((p) => p.title))],
      amount: last.amount,
      attempts: open.length,
      notes: notesBy.get(key) ?? [],
      lastAt: last.at,
      reason: kinds.has("FAILED") ? "תשלום נכשל" : kinds.has("PENDING") ? "לא השלים תשלום" : "עגלה נטושה",
    });
  }
  return out.sort((a, b) => b.amount - a.amount || b.lastAt.getTime() - a.lastAt.getTime());
}
