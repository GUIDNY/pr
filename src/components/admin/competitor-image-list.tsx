"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removeProductImageAction } from "@/actions/admin-products";
import type { CompetitorImageRow } from "@/lib/queries/admin-inventory";

/**
 * The photographs on this shop that belong to other shops.
 *
 * Someone classified those hosts by hand and deleted 1,428 images on the
 * strength of it. These arrived afterwards, on products created between 18
 * August and 2 September, which means the decision was made and then
 * undone — so this page is not a discovery, it is a standing list of a
 * known problem that keeps growing.
 *
 * It is here rather than in the "טיפול" queue because it is not a task.
 * Every row is the same choice — a competitor's photograph, or no product —
 * and 201 of the 202 have no second image, so deleting takes the product
 * off the shop rather than tidying it up. That is the owner's decision
 * about their own exposure, not work to be handed to whoever is next in
 * the queue, which is why the tab is theirs alone.
 *
 * The list is derived from the images themselves on every load, so a
 * product leaves it by being fixed. There is nothing to resolve and nothing
 * that can go stale.
 */
export function CompetitorImageList({ rows }: { rows: CompetitorImageRow[] }) {
  const [items, setItems] = useState(rows);
  const [isPending, startTransition] = useTransition();

  const live = items.filter((r) => r.liveOnSite).length;
  const wouldVanish = items.filter((r) => r.liveOnSite && r.totalImages === r.images.length).length;
  const images = items.reduce((n, r) => n + r.images.length, 0);

  function remove(row: CompetitorImageRow, imageId: string) {
    startTransition(async () => {
      const result = await removeProductImageAction(imageId);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה במחיקה");
        return;
      }
      setItems((prev) =>
        prev
          .map((r) =>
            r.productId === row.productId
              ? { ...r, images: r.images.filter((i) => i.id !== imageId), totalImages: r.totalImages - 1 }
              : r,
          )
          .filter((r) => r.images.length > 0),
      );
      toast.success("התמונה נמחקה");
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">תמונות ממתחרים</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          מוצרים שהתצלום שלהם נטען מהשרת של חנות מתחרה. הרשימה נגזרת מהתמונות עצמן בכל טעינה — מוצר
          יוצא ממנה כשמחליפים לו את התמונה, אין מה &quot;לסמן כטופל&quot;.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          אין תמונות ממתחרים בקטלוג.
        </div>
      ) : (
        <>
          <div className="border-warning/40 bg-warning/10 flex items-start gap-3 rounded-xl border p-4">
            <AlertTriangle className="text-warning-foreground mt-0.5 size-5 shrink-0" />
            <div className="text-sm">
              <p className="font-semibold">
                {images} תמונות על {items.length} מוצרים · {live} מהם מוצגים באתר
              </p>
              {/* The number that makes this a decision rather than a chore. */}
              <p className="text-muted-foreground mt-1">
                מתוכם <strong>{wouldVanish} מוצרים יירדו מהאתר מיד</strong> אם תמחק — זו התמונה היחידה
                שלהם, ומוצר בלי תמונה לא מוצג בחנות. הדרך לנקות בלי לאבד מוצר היא להעלות תצלום חלופי
                בעמוד המוצר, ואז למחוק כאן.
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-3">
            {items.map((row) => (
              <li key={row.productId} className="border-border bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <Link href={`/admin/products/${row.productId}`} className="text-sm font-medium hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      מק&quot;ט {row.sku} · {row.totalImages} תמונות במוצר
                      {row.liveOnSite ? (
                        <span className="text-success"> · מוצג באתר</span>
                      ) : (
                        <span> · לא מוצג באתר</span>
                      )}
                    </p>
                  </div>
                  <Link
                    href={`/product/${row.slug}`}
                    target="_blank"
                    className="text-muted-foreground hover:text-brand"
                    aria-label="צפייה בעמוד המוצר"
                  >
                    <ExternalLink className="size-4" />
                  </Link>
                </div>

                <ul className="mt-3 flex flex-col gap-2 border-t pt-3">
                  {row.images.map((img) => (
                    <li key={img.id} className="flex flex-wrap items-center gap-3">
                      {/* The picture itself, because "is this even the right
                          product" is the first question on every row. */}
                      <span className="bg-muted relative size-12 shrink-0 overflow-hidden rounded-lg">
                        <Image src={img.url} alt="" fill sizes="48px" className="object-contain p-1" referrerPolicy="no-referrer" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="text-destructive block text-sm font-medium" dir="ltr">
                          {img.host}
                        </span>
                        <span className="text-muted-foreground block truncate text-xs" dir="ltr">
                          {img.url}
                        </span>
                      </span>
                      {img.onlyImageForProduct && (
                        <span className="bg-destructive/10 text-destructive rounded-full px-2.5 py-1 text-xs font-medium">
                          התמונה היחידה — המוצר יירד מהאתר
                        </span>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={isPending}
                        onClick={() => remove(row, img.id)}
                      >
                        <Trash2 className="size-4" /> מחיקה
                      </Button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
