"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, ExternalLink, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { approveEnrichmentCandidateAction, rejectEnrichmentCandidateAction } from "@/actions/admin-enrichment";

export type EnrichmentCandidateData = {
  id: string;
  imageUrl: string | null;
  description: string | null;
  specs: string | null;
  sourceUrl: string | null;
  product: {
    id: string;
    sku: string;
    title: string;
    model: string | null;
    description: string | null;
    brand: { name: string };
    category: { name: string; attributes: { key: string; label: string; unit: string | null }[] };
    images: { url: string }[];
  };
};

// Nothing here ever touches the live product until an admin clicks
// "אשר" — this is purely a side-by-side of "what's live now" vs. "what was
// found on the manufacturer's site," so a bad match is obvious before it
// ever reaches a customer.
export function EnrichmentReviewCard({ candidate }: { candidate: EnrichmentCandidateData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  let specs: Record<string, string> = {};
  try {
    specs = candidate.specs ? JSON.parse(candidate.specs) : {};
  } catch {
    specs = {};
  }
  const attrByKey = new Map(candidate.product.category.attributes.map((a) => [a.key, a]));
  const specEntries = Object.entries(specs)
    .filter(([, v]) => v)
    .map(([key, value]) => {
      const attr = attrByKey.get(key);
      return { label: attr?.label ?? key, value: attr?.unit ? `${value} ${attr.unit}` : value };
    });

  function approve() {
    startTransition(async () => {
      const result = await approveEnrichmentCandidateAction(candidate.id);
      if (result.success) toast.success("אושר ועודכן במוצר");
      else toast.error(result.error ?? "האישור נכשל");
      router.refresh();
    });
  }

  function reject() {
    startTransition(async () => {
      const result = await rejectEnrichmentCandidateAction(candidate.id);
      if (result.success) toast.success("נדחה");
      else toast.error(result.error ?? "הדחייה נכשלה");
      router.refresh();
    });
  }

  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{candidate.product.title}</p>
          <p className="text-muted-foreground text-xs">
            {candidate.product.brand.name} · {candidate.product.model ?? "—"} · מק&quot;ט {candidate.product.sku} ·{" "}
            {candidate.product.category.name}
          </p>
        </div>
        {candidate.sourceUrl && (
          <a
            href={candidate.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground flex shrink-0 items-center gap-1 text-xs"
          >
            <ExternalLink className="size-3.5" /> מקור
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">כרגע באתר</p>
          <div className="bg-muted relative mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg">
            {candidate.product.images[0] ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external domains, admin-only preview
              <img src={candidate.product.images[0].url} alt="" className="size-full object-cover" />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center">
                <Package className="size-8" />
              </div>
            )}
          </div>
          <p className="text-muted-foreground line-clamp-4 text-xs">{candidate.product.description ?? "אין תיאור"}</p>
        </div>

        <div>
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">מוצע מהיצרן</p>
          <div className="bg-muted relative mb-2 flex aspect-square items-center justify-center overflow-hidden rounded-lg">
            {candidate.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external domains, admin-only preview
              <img src={candidate.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              <div className="text-muted-foreground flex size-full items-center justify-center">
                <Package className="size-8" />
              </div>
            )}
          </div>
          <p className="line-clamp-4 text-xs">{candidate.description ?? "לא נמצא תיאור"}</p>
        </div>
      </div>

      {specEntries.length > 0 && (
        <div className="mt-3">
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">מפרט טכני מוצע</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg border p-2.5 text-xs sm:grid-cols-3">
            {specEntries.map(({ label, value }) => (
              <div key={label} className="flex justify-between gap-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" size="sm" onClick={reject} disabled={isPending} className="gap-1.5">
          <X className="size-3.5" /> דחה
        </Button>
        <Button variant="brand" size="sm" onClick={approve} disabled={isPending} className="gap-1.5">
          <Check className="size-3.5" /> אשר ועדכן במוצר
        </Button>
      </div>
    </div>
  );
}
