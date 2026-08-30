import { Ruler } from "lucide-react";
import type { SpecRow } from "@/lib/product-content";

// The spec table a shopper compares two products with. Deliberately not
// cards: a specification is a label and a value, and every pixel spent on
// a border around each pair is a pixel not spent on fitting more of them
// on screen. Two columns from sm: up, one per row below it — a label and
// a value side by side in half a phone's width truncate each other.
//
// Zebra rows on mobile, hairline dividers on desktop: in a two-column grid
// the alternating background lands as a checkerboard rather than as rows,
// which reads as noise, so the striping is switched off exactly where the
// grid becomes two columns.
export function ProductSpecTable({ rows }: { rows: SpecRow[] }) {
  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-10">
      {rows.map((row, i) => (
        <div
          key={`${row.label}-${i}`}
          className="border-border flex items-baseline justify-between gap-4 px-3 py-2.5 text-sm even:bg-secondary/40 sm:border-b sm:px-0 sm:even:bg-transparent"
        >
          <dt className="text-muted-foreground shrink-0">{row.label}</dt>
          {/* dir="auto" per value: a spec is often a Latin/numeric string
              ending in a unit mark — 55", 1024X768, 10W x1 — and in an RTL
              paragraph the trailing mark jumps to the far side, so 55"
              renders as "55. Letting each value pick its own direction
              from its first strong character keeps it as written. */}
          <dd dir="auto" className="text-end font-semibold">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// Height/width/depth read as a set, not as three more rows in a long
// table — someone checking whether an appliance fits an opening is asking
// one question, and answering it needs the three numbers next to each
// other. Renders nothing when the product has no dimension data, like
// every other section here: a missing field is absent, never a blank row.
export function ProductDimensionsBlock({ dimensions }: { dimensions: SpecRow[] }) {
  if (dimensions.length === 0) return null;

  return (
    <section>
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold">
        <Ruler className="text-brand size-4" />
        מידות
      </h3>
      {/* auto-fit, not a fixed 4-up: the hairline effect here is the
          container's own colour showing through 1px gaps, so a fixed
          column count paints an empty grey cell whenever a product has
          fewer dimensions than columns — two dimensions in a 4-column grid
          left half the row a blank grey block. auto-fit stretches the
          tracks that exist instead of reserving ones that don't. */}
      <div className="border-border grid gap-px overflow-hidden rounded-lg border bg-border [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
        {dimensions.map((d, i) => (
          <div key={`${d.label}-${i}`} className="bg-card px-3 py-3 text-center">
            <p className="text-muted-foreground text-xs">{d.label}</p>
            <p dir="auto" className="mt-0.5 text-base font-bold">{d.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
