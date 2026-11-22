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
