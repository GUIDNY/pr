import { getEnrichmentCandidates, getEnrichmentSummary } from "@/lib/queries/admin-enrichment";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { EnrichmentReviewCard } from "@/components/admin/enrichment-review-card";
import { ApproveAllEnrichmentButton } from "@/components/admin/approve-all-enrichment-button";
import { Sparkles } from "lucide-react";

export const metadata = { title: "העשרת מוצרים | A&I Electronics Admin" };

export default async function InventoryEnrichmentPage() {
  const [candidates, summary] = await Promise.all([getEnrichmentCandidates("PENDING"), getEnrichmentSummary()]);

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">העשרת מוצרים</h1>
        <ApproveAllEnrichmentButton count={candidates.length} />
      </div>
      <p className="text-muted-foreground mb-4 text-sm">
        תמונות ותיאורים שנמצאו באתרי היצרנים, מחכים לאישור — שום דבר לא מתפרסם באתר לפני שאתה מאשר אותו כאן.
      </p>
      <InventoryTabs />

      <div className="text-muted-foreground mb-4 text-sm">
        {summary.pending} ממתינים לאישור · {summary.approved} אושרו · {summary.rejected} נדחו
      </div>

      {candidates.length === 0 ? (
        <div className="border-border bg-card text-muted-foreground flex flex-col items-center gap-2 rounded-xl border p-10 text-center text-sm">
          <Sparkles className="size-8" />
          אין מועמדים ממתינים לאישור כרגע
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {candidates.map((c) => (
            <EnrichmentReviewCard key={c.id} candidate={c} />
          ))}
        </div>
      )}
    </div>
  );
}
