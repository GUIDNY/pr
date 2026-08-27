import { Box, Snowflake, Zap, Volume2, Palette, Ruler, Plug, Info } from "lucide-react";
import type { KeyFact } from "@/lib/product-key-facts";
import { cn } from "@/lib/utils";

const ICONS = { capacity: Box, cold: Snowflake, energy: Zap, noise: Volume2, color: Palette, dimension: Ruler, power: Plug, generic: Info };

// Compact chip row for the fast facts a shopper scans before reading
// anything else — desktop shows them in one line, mobile wraps to a 2-col
// grid so nothing gets cut off. Renders nothing when there's no real data,
// same rule as everywhere else on this page: no data, no fabricated chip.
export function ProductKeyFactsStrip({ facts }: { facts: KeyFact[] }) {
  if (facts.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5">
      {facts.map((fact, i) => {
        const Icon = ICONS[fact.icon];
        // Real scraped values aren't always short specs like "238 ליטר" —
        // some are full descriptive phrases ("מכונות קפה Faber"), confirmed
        // live. Squeezed into a half-width mobile cell those wrap into a
        // cramped 3-line stack; a lone odd-count last chip has the same
        // empty-cell problem. Either case gets the full row on mobile.
        const isLong = fact.value.length > 14;
        const isOrphan = i === facts.length - 1 && facts.length % 2 === 1;
        const spanFull = isLong || isOrphan;
        return (
          <div
            key={i}
            // A full pill shape only reads well with short, single-line
            // content — on the mobile 2-col grid a longer value needs to
            // wrap, and a pill clipped mid-word looks worse than a plain
            // rounded card that just wraps. Desktop's single flex-wrap row
            // has more breathing room, so the pill shape works fine there.
            className={cn(
              "border-border bg-card flex min-w-0 items-center gap-2 rounded-xl border px-3 py-1.5 shadow-sm sm:w-auto sm:rounded-full",
              spanFull && "col-span-2",
              isOrphan && "justify-center"
            )}
            title={fact.label}
          >
            <Icon className="text-brand size-4 shrink-0" />
            <span className="text-sm leading-snug font-semibold sm:truncate">{fact.value}</span>
          </div>
        );
      })}
    </div>
  );
}
