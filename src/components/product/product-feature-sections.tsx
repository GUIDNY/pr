import { cn } from "@/lib/utils";

// The premium "feature write-up" treatment for whatever real prose remains
// after the short punchy lines are pulled out as highlights (see
// parseProductDescription) — same real text as before, just given the
// spacious alternating-block layout instead of one flat wall of paragraphs.
// No per-feature images: the product's gallery photos aren't tagged to any
// particular feature, and pairing them up by guesswork would imply a
// correspondence the data doesn't actually have — a clean text block reads
// more honest than a picture that may not even show what the text
// describes. Renders nothing when there's no prose left over.
export function ProductFeatureSections({ prose }: { prose: string[] }) {
  if (prose.length === 0) return null;

  return (
    <div>
      <h3 className="mb-3 text-base font-bold">תכונות וטכנולוגיות מרכזיות</h3>
      <div className="flex flex-col gap-3">
        {prose.map((p, i) => (
          <div
            key={i}
            className={cn(
              "rounded-2xl p-4 sm:p-5",
              i % 2 === 0 ? "border-border bg-card border shadow-sm" : "bg-secondary/50"
            )}
          >
            <p className={i === 0 ? "text-foreground text-base leading-relaxed font-medium" : "text-foreground/85 text-sm leading-relaxed"}>
              {p}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
