import { db } from "@/lib/db";

// The client a $transaction callback is handed. Derived from `db` rather
// than imported as Prisma.TransactionClient, because `db` is an extended
// client (a driver adapter) and the two are not the same type.
type SlugTx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Remember an address a product used to live at.
 *
 * A slug is public — it is the product URL, so it is in Google's index, in
 * customers' WhatsApp history and in whatever a supplier bookmarked. Changing
 * one without recording the old value turns every one of those links into a
 * 404, silently and permanently. So nothing changes a slug directly: it goes
 * through here, and product/[slug]/page.tsx 301s the old address to the new
 * one afterwards.
 *
 * Callable inside a transaction (pass `tx`) so the rename and the record of
 * it cannot come apart.
 */
export async function recordSlugChange(
  productId: string,
  previousSlug: string,
  nextSlug: string,
  tx: SlugTx = db,
): Promise<void> {
  const from = previousSlug.trim();
  const to = nextSlug.trim();
  if (!from || from === to) return;

  // A -> B -> A puts the product back on an address history already holds.
  // The row is now wrong (it would redirect a live URL to itself), so drop
  // it rather than letting the unique index reject the whole rename.
  await tx.productSlugHistory.deleteMany({ where: { slug: to } });

  // The same old address may already be recorded — from an earlier rename of
  // this product, or, once, from a different product that has since moved off
  // it. Either way the newest owner is the right answer, so overwrite.
  await tx.productSlugHistory.upsert({
    where: { slug: from },
    update: { productId },
    create: { productId, slug: from },
  });
}
