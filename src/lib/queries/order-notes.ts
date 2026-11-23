import "server-only";
import { db } from "@/lib/db";

export type LastNote = { body: string; createdAt: Date };

/**
 * The newest internal note of each order, for the lists, so a note can be
 * read without opening the order. One query for the whole page, not one per
 * row: `distinct` on orderId over notes ordered newest first.
 */
export async function latestInternalNotes(orderIds: string[]): Promise<Map<string, LastNote>> {
  const out = new Map<string, LastNote>();
  if (orderIds.length === 0) return out;
  const rows = await db.orderNote.findMany({
    where: { orderId: { in: orderIds }, isInternal: true },
    orderBy: { createdAt: "desc" },
    distinct: ["orderId"],
    select: { orderId: true, body: true, createdAt: true },
  });
  for (const r of rows) out.set(r.orderId, { body: r.body, createdAt: r.createdAt });
  return out;
}

/**
 * Which of these orders the customer asked to be called back about, from the
 * failure page. The OrderNotification row written when the owner was told is
 * the record; a note can be buried under later ones, this cannot.
 */
export async function callbackRequestedIds(orderIds: string[]): Promise<Set<string>> {
  if (orderIds.length === 0) return new Set();
  const rows = await db.orderNotification.findMany({
    where: { orderId: { in: orderIds }, event: "CALLBACK_REQUEST" },
    select: { orderId: true },
  });
  return new Set(rows.map((r) => r.orderId));
}

export async function internalNotesFor(orderId: string) {
  const rows = await db.orderNote.findMany({
    where: { orderId },
    orderBy: { createdAt: "desc" },
    select: { id: true, body: true, createdAt: true, author: { select: { name: true } } },
  });
  return rows.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt.toISOString(),
    authorName: n.author?.name ?? null,
  }));
}
