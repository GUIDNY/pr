import type { Metadata } from "next";
import { Star } from "lucide-react";
import { db } from "@/lib/db";
import { verifyReviewToken } from "@/lib/review-link";
import { ReviewForm } from "@/components/review/review-form";

export const metadata: Metadata = { title: "דרגו את הרכישה", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Where a review request leads: the order's products, five stars each. See actions/reviews.ts. */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ t?: string }>;
}) {
  const { orderNumber } = await params;
  const { t } = await searchParams;
  const valid = verifyReviewToken(orderNumber, t);
  const order = valid
    ? await db.order.findUnique({
        where: { orderNumber },
        select: {
          id: true,
          guestName: true,
          user: { select: { name: true } },
          items: {
            select: {
              productId: true,
              titleSnap: true,
              product: { select: { images: { select: { url: true }, take: 1, orderBy: { sortOrder: "asc" } } } },
            },
          },
        },
      })
    : null;
  const submitted = order
    ? await db.auditLog.findFirst({ where: { action: "REVIEW_SUBMITTED", entityType: "Order", entityId: order.id }, select: { id: true } })
    : null;
  const firstName = (order?.user?.name ?? order?.guestName ?? "").trim().split(/\s+/)[0];
  const items = order
    ? [...new Map(order.items.map((i) => [i.productId, { productId: i.productId, title: i.titleSnap, imageUrl: i.product.images[0]?.url ?? null }])).values()]
    : [];

  return (
    <div className="bg-muted/30 min-h-[70vh]">
      <div className="mx-auto max-w-xl px-4 py-10">
        <div className="mb-6 text-center">
          <div className="mb-2 flex justify-center gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className="size-6 fill-amber-400 text-amber-400" />
            ))}
          </div>
          <h1 className="text-2xl font-black sm:text-3xl">{firstName ? `${firstName}, איך היה?` : "איך היה?"}</h1>
          <p className="text-muted-foreground mt-1">דקה אחת של דירוג עוזרת ללקוחות הבאים לבחור נכון.</p>
        </div>
        {!order ? (
          <p className="bg-card rounded-2xl border p-6 text-center">הקישור לא תקין. אפשר לפנות אלינו בוואטסאפ ונשמח לשמוע.</p>
        ) : submitted ? (
          <p className="bg-card rounded-2xl border p-6 text-center">כבר קיבלנו מכם ביקורת על ההזמנה הזאת — תודה רבה!</p>
        ) : (
          <ReviewForm orderNumber={orderNumber} token={t!} items={items} />
        )}
      </div>
    </div>
  );
}
