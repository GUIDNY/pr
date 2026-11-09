"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { verifyReviewToken } from "@/lib/review-link";

/**
 * Customer reviews: written through the signed link a review request
 * carries (lib/review-link), held until someone in the back office approves
 * them. Only approved reviews reach the product page and its rich results
 * (queries/products.ts reads isApproved) — a review is shown to customers
 * and to Google, so a person reads it first.
 */
export async function submitReviewsAction(
  orderNumber: string,
  token: string,
  entries: { productId: string; rating: number; body?: string }[],
): Promise<{ ok: boolean; error?: string }> {
  if (!verifyReviewToken(orderNumber, token)) return { ok: false, error: "הקישור לא תקין" };
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: {
      id: true,
      userId: true,
      guestName: true,
      user: { select: { name: true } },
      items: { select: { productId: true } },
    },
  });
  if (!order) return { ok: false, error: "ההזמנה לא נמצאה" };
  const already = await db.auditLog.findFirst({ where: { action: "REVIEW_SUBMITTED", entityType: "Order", entityId: order.id } });
  if (already) return { ok: false, error: "כבר שלחתם ביקורת על ההזמנה הזאת — תודה!" };

  const bought = new Set(order.items.map((i) => i.productId).filter(Boolean));
  const valid = entries.filter((e) => bought.has(e.productId) && Number.isInteger(e.rating) && e.rating >= 1 && e.rating <= 5);
  if (valid.length === 0) return { ok: false, error: "דרגו לפחות מוצר אחד בכוכבים" };

  /* First name and the initial of the last, the way shops sign reviews: the
     customer is recognisable to themselves and to nobody else. */
  const full = (order.user?.name ?? order.guestName ?? "").trim().split(/\s+/);
  const authorName = full[0] ? `${full[0]}${full[1] ? ` ${full[1].charAt(0)}.` : ""}` : "לקוח/ה";

  await db.$transaction([
    ...valid.map((e) =>
      db.review.create({
        data: {
          productId: e.productId,
          userId: order.userId,
          authorName,
          rating: e.rating,
          body: e.body?.trim().slice(0, 2000) || null,
          isApproved: false,
        },
      }),
    ),
    db.auditLog.create({
      data: { actorId: order.userId, action: "REVIEW_SUBMITTED", entityType: "Order", entityId: order.id, metadata: JSON.stringify({ count: valid.length }) },
    }),
  ]);
  return { ok: true };
}

async function refreshRating(productId: string) {
  const agg = await db.review.aggregate({ where: { productId, isApproved: true }, _avg: { rating: true }, _count: { _all: true } });
  await db.product.update({
    where: { id: productId },
    data: { ratingAvg: Math.round((agg._avg.rating ?? 0) * 10) / 10, ratingCount: agg._count._all },
  });
}

export async function approveReviewAction(reviewId: string) {
  const session = await requireAdmin();
  const review = await db.review.update({ where: { id: reviewId }, data: { isApproved: true }, select: { productId: true } });
  await refreshRating(review.productId);
  await logAudit({ actorId: session.sub, action: "REVIEW_APPROVED", entityType: "Review", entityId: reviewId });
  revalidatePath("/admin/reviews");
}

export async function deleteReviewAction(reviewId: string) {
  const session = await requireAdmin();
  const review = await db.review.delete({ where: { id: reviewId }, select: { productId: true } });
  await refreshRating(review.productId);
  await logAudit({ actorId: session.sub, action: "REVIEW_DELETED", entityType: "Review", entityId: reviewId });
  revalidatePath("/admin/reviews");
}
