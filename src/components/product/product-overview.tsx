import { Check } from "lucide-react";
import { InlineMarkdown } from "@/components/product/inline-markdown";
import type { SpecRow, FeatureItem, ContentSection } from "@/lib/product-content";

const MAX_FACT_ROWS = 8;

// The card that sits beside the description on a wide screen. It is the
// answer to the shape the overview had before it: an 1100px column with a
// 62ch reading measure inside it, which on a 1280px window is a paragraph
// against 600px of nothing, and a section rule stretching the whole way
// across that emptiness. Text in one column, the facts in the other.
//
// Labelled rows, not the value-only chips this replaced. A chip carrying
// "לא" or "2.0" and nothing else asks the reader to guess the question it
// answers — and it is what made four boolean specs render as four chips
// reading "false".
//
// Brand, model and warranty are in here on purpose: they are present on
// almost every product in the catalog, so the card is never the thin,
// half-empty box that a spec-only version would be on a product whose
// specs have not been filled in yet.
export function ProductFactCard({
  facts,
  brand,
  model,
  warrantyMonths,
}: {
  facts: SpecRow[];
  brand: string;
  model?: string | null;
  warrantyMonths?: number | null;
}) {
  const rows: SpecRow[] = [{ label: "מותג", value: brand }];
  if (model) rows.push({ label: "דגם", value: model });
  for (const fact of facts) {
    if (rows.length >= MAX_FACT_ROWS) break;
    if (rows.some((r) => r.label === fact.label)) continue;
    rows.push(fact);
  }
  if (warrantyMonths) rows.push({ label: "אחריות", value: `${warrantyMonths} חודשים` });

  // self-start, or the grid stretches the card to the height of the
  // description next to it and it becomes a mostly-empty box a metre tall
  // — and a stretched item cannot stick either.
  //
  // order-first on a phone: with one column the card would otherwise land
  // after a description that can run a full screen, and the facts someone
  // came to check would be the last thing they reach. On a wide screen it
  // goes back to sitting beside the text.
  return (
    <aside className="border-border bg-card order-first self-start rounded-2xl border p-5 lg:order-none lg:sticky lg:top-28">
      <h2 className="mb-3 text-base font-bold">במבט מהיר</h2>
      <dl className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={`${row.label}-${i}`}
            className="border-border/60 flex items-baseline justify-between gap-3 border-b py-2.5 text-sm last:border-b-0 last:pb-0"
          >
            <dt className="text-muted-foreground shrink-0">{row.label}</dt>
            {/* dir="auto" per value, same reason as the spec table: 55" and
                1000 Watt keep their own direction inside an RTL page. */}
            <dd dir="auto" className="text-end font-semibold">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}

export function ProductSummary({ summary }: { summary: string }) {
  if (!summary) return null;
  return (
    <section>
      <h2 className="mb-2 text-lg font-bold">כמה מילים על המוצר</h2>
      <p className="text-foreground/85 max-w-[68ch] text-base leading-[1.75] sm:text-[17px]"><InlineMarkdown text={summary} /></p>
    </section>
  );
}

// Titled features, without the card-per-paragraph treatment that made the
// page read as a stack of boxes. The only ornament is a hairline rule on
// the inline-start edge — in RTL the right-hand side, where the eye starts
// and where the text actually begins. It was border-e first, which put the
// rule at the far left of an 1100px column with its own text a full column
// away from it: a stray orange line down the empty side of the page.
export function ProductFeatureList({ features }: { features: FeatureItem[] }) {
  if (features.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-lg font-bold">תכונות וטכנולוגיות</h2>
      <div className="flex flex-col gap-4">
        {features.map((feature, i) => (
          <div key={`${feature.title}-${i}`} className="border-brand/30 border-s-2 ps-3.5">
            <h3 className="text-base font-bold"><InlineMarkdown text={feature.title} /></h3>
            <p className="text-foreground/80 mt-1 max-w-[68ch] text-[15px] leading-[1.75] sm:text-base"><InlineMarkdown text={feature.body} /></p>
          </div>
        ))}
      </div>
    </section>
  );
}

// A description that is a list of short lines in the source stays a list
// here. Rendering each of those lines as its own paragraph is what turned
// a 20-item Dyson feature list into a page of one-sentence blocks.
export function ProductBulletList({ bullets, title }: { bullets: string[]; title: string }) {
  if (bullets.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      <ul className="grid grid-cols-1 gap-x-10 gap-y-2.5 sm:grid-cols-2">
        {bullets.map((bullet, i) => (
          <li key={`${bullet}-${i}`} className="flex items-start gap-2 text-[15px] sm:text-base">
            <Check className="text-brand mt-1 size-4 shrink-0" />
            <span className="text-foreground/85 leading-[1.6]"><InlineMarkdown text={bullet} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ProductProse({ paragraphs }: { paragraphs: string[] }) {
  if (paragraphs.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} dir="auto" className="text-foreground/85 max-w-[68ch] text-[15px] leading-[1.75] sm:text-base">
          <InlineMarkdown text={p} />
        </p>
      ))}
    </div>
  );
}

// The source text's own sections, kept as sections. A supplier description
// writes "מפרט טכני:" and then lists the technical data; before this, that
// heading was dropped and its contents were glued onto the paragraph above
// it — which is how a 1,674-character Electrolux description arrived on the
// page as one unbroken block.
export function ProductSections({ sections }: { sections: ContentSection[] }) {
  if (sections.length === 0) return null;

  return (
    <>
      {sections.map((section, i) => (
        // A hairline above each heading gives the page chapters. Without
        // it a long description is one grey column from the summary to the
        // brand banner, and nothing tells the eye where to rest.
        <section key={`${section.title}-${i}`} className="border-border/70 border-t pt-7">
          <h2 className="mb-3 text-lg font-bold"><InlineMarkdown text={section.title} /></h2>
          <div className="flex flex-col gap-4">
            {section.features.map((feature, j) => (
              <div key={`${feature.title}-${j}`} className="border-brand/30 border-s-2 ps-3.5">
                <h3 className="text-base font-bold"><InlineMarkdown text={feature.title} /></h3>
                <p className="text-foreground/80 mt-1 max-w-[68ch] text-[15px] leading-[1.75] sm:text-base"><InlineMarkdown text={feature.body} /></p>
              </div>
            ))}
            {section.bullets.length > 0 && (
              <ul className="grid grid-cols-1 gap-x-10 gap-y-2.5 sm:grid-cols-2">
                {section.bullets.map((bullet, j) => (
                  <li key={`${bullet}-${j}`} className="flex items-start gap-2 text-[15px] sm:text-base">
                    <Check className="text-brand mt-1 size-4 shrink-0" />
                    <span className="text-foreground/85 leading-[1.6]"><InlineMarkdown text={bullet} /></span>
                  </li>
                ))}
              </ul>
            )}
            {section.prose.map((paragraph, j) => (
              <p key={j} dir="auto" className="text-foreground/85 max-w-[68ch] text-[15px] leading-[1.75] sm:text-base">
                <InlineMarkdown text={paragraph} />
              </p>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
