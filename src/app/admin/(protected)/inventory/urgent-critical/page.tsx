import Link from "next/link";
import { AlertTriangle, Package, ExternalLink, Banknote, Wrench } from "lucide-react";
import { getUrgentReviewProducts } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { formatDateTime } from "@/lib/format";
import {
  parseUrgentReviewReason,
  toneForKind,
  type ReasonTone,
} from "@/lib/inventory/urgent-review-reason";
import { cn } from "@/lib/utils";

export const metadata = { title: "טיפול דחוף | Buy Today Admin" };

// A product gets here by being flagged by hand — from the button on its own
// product page, or by whoever worked through the catalogue and wrote down
// what they found. It stays until the flag is removed from that same button;
// the site's publish state is not touched either way.
//
// The finding itself is on the card now. It was always stored on the alert
// and never rendered, so a list of 60 products showed 60 names and no
// reasons, and the only person who could act on it was the one who wrote it.

const CHIP_TONE: Record<ReasonTone, string> = {
  destructive: "border-destructive/30 bg-destructive/10 text-destructive",
  warning: "border-warning/40 bg-warning/15 text-warning-foreground dark:text-warning",
  muted: "border-border bg-muted text-muted-foreground",
};

export default async function UrgentReviewInventoryPage() {
  const items = await getUrgentReviewProducts();

  const reasons = items.map((item) => ({
    item,
    reason: parseUrgentReviewReason(item.metadata, item.message),
  }));

  // One chip per kind of finding, commonest first, so the queue can be worked
  // a problem at a time instead of a product at a time — nineteen price
  // duplicates decided in one sitting share the same question.
  const counts = new Map<string, { label: string; tone: ReasonTone; count: number }>();
  for (const { reason } of reasons) {
    const key = reason.kind ?? reason.label;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { label: reason.label, tone: toneForKind(reason.kind), count: 1 });
  }
  const summary = [...counts.values()].sort((a, b) => b.count - a.count);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">מרכז בקרת מלאי</h1>
      <InventoryTabs />

      <div className="mb-4 flex items-center gap-2">
        <AlertTriangle className="text-destructive size-5" />
        <h2 className="text-lg font-bold">טיפול דחוף</h2>
        <span className="text-muted-foreground text-sm">({items.length.toLocaleString("he-IL")})</span>
      </div>
      <p className="text-muted-foreground mb-4 max-w-3xl text-sm">
        מוצרים שסומנו ידנית לטיפול דחוף. הרשימה לא מתמלאת אוטומטית, ורק הסרת הסימון מדף המוצר מוציאה מוצר ממנה. לכל מוצר
        רשומה כאן הסיבה שבגללה הוא נמצא כאן, מה היא מסכנת ומה צריך להחליט.{" "}
        <span className="text-foreground">
          מוצר שחסרה לו גם תמונה רשמית ימשיך להופיע במקביל בטאב &quot;טיפול&quot;
        </span>{" "}
        — זו סיבה נפרדת ותיקון נפרד, והסרת הסימון כאן לא מסירה אותה שם.
      </p>

      {summary.length > 0 && (
        <div className="mb-5 flex flex-wrap gap-1.5">
          {summary.map((entry) => (
            <span
              key={entry.label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
                CHIP_TONE[entry.tone],
              )}
            >
              {entry.label}
              <span className="opacity-70">{entry.count.toLocaleString("he-IL")}</span>
            </span>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border p-10 text-center text-sm">
          <AlertTriangle className="text-success size-8" />
          אין כרגע מוצרים שסומנו לטיפול דחוף
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {reasons.map(({ item, reason }) => (
            <div key={item.id} className="border-destructive/30 bg-card rounded-xl border p-3">
              <div className="flex items-center gap-3">
                <span className="bg-destructive/10 text-destructive flex size-11 shrink-0 items-center justify-center rounded-lg">
                  <Package className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.product.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {item.product.brand.name} · {item.product.category.name} · מק&quot;ט {item.product.sku} · במלאי{" "}
                    {item.product.stockQty}
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-xs">סומן {formatDateTime(item.createdAt)}</p>
                </div>
                <Link
                  href={`/product/${item.product.slug}`}
                  target="_blank"
                  className="border-border hover:border-brand/40 hover:text-brand flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                >
                  <ExternalLink className="size-3.5" />
                  פתח דף מוצר לתיקון
                </Link>
              </div>

              <div className="border-border/70 mt-3 border-t pt-3">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
                    CHIP_TONE[toneForKind(reason.kind)],
                  )}
                >
                  {reason.label}
                </span>

                {/* pre-line, not a plain paragraph: several findings are two
                    separate observations with a blank line between them, and
                    collapsing that runs them into one sentence that reads as
                    a contradiction. */}
                <p className="text-foreground/90 mt-2 text-sm leading-relaxed whitespace-pre-line">{reason.why}</p>

                {reason.risk && (
                  <p className="text-muted-foreground mt-2 flex items-start gap-1.5 text-xs">
                    <Banknote className="mt-0.5 size-3.5 shrink-0" />
                    <span>{reason.risk}</span>
                  </p>
                )}

                {reason.action && (
                  <p className="text-foreground mt-1.5 flex items-start gap-1.5 text-xs font-medium">
                    <Wrench className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      <span className="text-muted-foreground font-normal">מה צריך להחליט: </span>
                      {reason.action}
                    </span>
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
