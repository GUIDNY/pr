import Link from "next/link";
import { Star } from "lucide-react";
import { requireCatalogPage } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { ReviewModerationButtons } from "@/components/admin/review-moderation-buttons";

export const metadata = { title: "אישור ביקורות | Buy Today Admin" };
export const dynamic = "force-dynamic";

/** Reviews customers wrote through a review request, waiting for a person to read them. See actions/reviews.ts. */
export default async function ReviewsPage() {
  await requireCatalogPage();
  const [pending, approvedCount] = await Promise.all([
    db.review.findMany({
      where: { isApproved: false },
      orderBy: { createdAt: "desc" },
      select: { id: true, rating: true, body: true, authorName: true, createdAt: true, product: { select: { title: true, slug: true } } },
    }),
    db.review.count({ where: { isApproved: true } }),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Star className="size-6 fill-amber-400 text-amber-400" /> אישור ביקורות
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {pending.length} ממתינות · {approvedCount} מאושרות באתר. רק ביקורת מאושרת מופיעה בדף המוצר ובגוגל.
        </p>
      </div>
      {pending.length === 0 ? (
        <p className="bg-card text-muted-foreground rounded-xl border p-8 text-center">
          אין ביקורות שממתינות. בקשות ביקורת שולחים מ<Link href="/admin/follow-up" className="text-brand underline">מעקב אחרי רכישה</Link>.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((r) => (
            <li key={r.id} className="bg-card flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <Link href={`/product/${r.product.slug}`} className="text-sm font-semibold hover:underline" target="_blank">
                  {r.product.title}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-sm" dir="ltr">
                  <span className="flex" aria-label={`${r.rating} כוכבים`}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star key={n} className={`size-4 ${n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                    ))}
                  </span>
                </div>
                {r.body && <p className="mt-2 text-sm leading-relaxed">{r.body}</p>}
                <p className="text-muted-foreground mt-1 text-xs">
                  {r.authorName} · {formatDate(r.createdAt)}
                </p>
              </div>
              <ReviewModerationButtons reviewId={r.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
