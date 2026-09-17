import type { ImageReadinessRow } from "@/lib/queries/admin-inventory";

/**
 * The migration's progress stated as products rather than files.
 *
 * The panel below this one counts images, which is the right unit for the
 * job and the wrong one for the question everybody actually asks — "how
 * many of my products can Google show". A product's second photograph and
 * an unpublished product's first both count in one number and neither
 * matters to the other.
 *
 * Ordered by who has to act, not by size: the two rows that resolve
 * themselves first, then the three that need a person. The last three are
 * the honest part — they will not move however long the cron runs.
 */
export function ImageReadiness({ rows }: { rows: ImageReadinessRow[] }) {
  const total = rows.reduce((n, r) => n + r.products, 0);
  if (total === 0) return null;

  const automatic = rows.filter((r) => r.key === "ours" || r.key === "migratable");
  const needsAPerson = rows.filter((r) => r.key !== "ours" && r.key !== "migratable");
  const stuck = needsAPerson.reduce((n, r) => n + r.products, 0);

  return (
    <section className="border-border bg-card mb-6 rounded-2xl border p-4">
      <h2 className="text-base font-semibold">מוצרים חיים לפי התמונה הראשית</h2>
      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
        {total} מוצרים מפורסמים, לפי השרת שמארח את <strong>התמונה הראשית</strong> של כל אחד. רק היא נשלחת
        כ-image_link בפיד, אז מוצר עם שש תמונות שהראשית שלו עדיין על שרת היצרן לא זז אצל גוגל.
      </p>
      {/* Said plainly because the opposite was believed here for a day: the
          products that are not showing in Merchant Center are mostly not
          rejected, they are queued behind a new account's first review.
          A panel that implies otherwise sends someone to fix the wrong
          thing. */}
      <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
        זה <strong>לא</strong> המספר של מה שגוגל דוחה. רוב המוצרים שלא מוצגים ממתינים לסקירה ראשונית של
        החשבון ולא נדחו כלל. מה שמופיע כאן הוא עמידות התמונות עצמן — נכון בלי קשר לתור, ורלוונטי לגוגל
        תמונות ולדחיות שכן נוגעות לתמונה.
      </p>

      <ul className="mt-4 space-y-2">
        {rows.map((r) => {
          const pct = Math.round((r.products / total) * 100);
          const isAutomatic = r.key === "ours" || r.key === "migratable";
          return (
            <li key={r.key} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium">{r.label}</span>
                <span className="text-sm tabular-nums">
                  <span className="font-semibold">{r.products}</span>
                  <span className="text-muted-foreground"> · {pct}%</span>
                </span>
              </div>
              <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                <div
                  className={isAutomatic ? "bg-success h-full rounded-full" : "bg-warning h-full rounded-full"}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-muted-foreground text-xs leading-relaxed">{r.note}</p>
            </li>
          );
        })}
      </ul>

      <p className="text-muted-foreground mt-4 border-t pt-3 text-xs leading-relaxed">
        {automatic.reduce((n, r) => n + r.products, 0)} מוצרים מסתדרים לבד. <strong>{stuck}</strong> לא —
        הם מחכים להחלטה או לשיחת טלפון, ולא לקוד. הקרון יכול לרוץ שבוע והמספר הזה לא יזוז.
      </p>
    </section>
  );
}
