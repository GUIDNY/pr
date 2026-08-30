import { Box, Snowflake, Zap, Volume2, Palette, Ruler, Plug, Info, Check } from "lucide-react";
import type { SpecRow, FeatureItem } from "@/lib/product-content";
import { cn } from "@/lib/utils";

const ICONS = {
  capacity: Box,
  cold: Snowflake,
  energy: Zap,
  noise: Volume2,
  color: Palette,
  dimension: Ruler,
  power: Plug,
  generic: Info,
} as const;

type IconKey = keyof typeof ICONS;

function iconFor(label: string): IconKey {
  const t = label.toLowerCase();
  if (/ליטר|נפח|קיבולת|capacity|volume/.test(t)) return "capacity";
  if (/קרח|frost|קירור|הקפא|טמפרטורה/.test(t)) return "cold";
  if (/אנרג|energy|דירוג/.test(t)) return "energy";
  if (/רעש|db\b|noise/.test(t)) return "noise";
  if (/צבע|color|גימור/.test(t)) return "color";
  if (/מידות|גובה|רוחב|עומק|dimension|גודל/.test(t)) return "dimension";
  if (/וואט|watt|הספק|power|צריכ/.test(t)) return "power";
  return "generic";
}

// The first thing on the page after the price: four to six facts a
// shopper can take in without reading. Values only — a shopper scanning
// "46 ליטר · 1000W · 12 תוכניות" does not need each one captioned, and
// the label is kept as the tooltip for the one case where the value alone
// is ambiguous.
//
// Compact by construction: no card, no shadow, one line each. Two columns
// on a phone, a single wrapping row from sm: up.
export function ProductHighlights({ facts }: { facts: SpecRow[] }) {
  if (facts.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2.5 text-sm font-bold">עיקרי המוצר</h2>
      <ul className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {facts.map((fact, i) => {
          const Icon = ICONS[iconFor(fact.label)];
          // A value long enough to wrap inside half a phone's width gets
          // the whole row instead — real values are not all "46 ליטר",
          // some are a short phrase, and a two-line chip in a grid cell
          // drags its neighbour's height with it.
          const spansRow = fact.value.length > 16;
          return (
            <li
              key={`${fact.label}-${i}`}
              title={fact.label}
              className={cn(
                "border-border bg-card flex min-w-0 items-center gap-2 rounded-lg border px-2.5 py-2 sm:py-1.5",
                spansRow && "col-span-2",
              )}
            >
              <Icon className="text-brand size-4 shrink-0" />
              {/* dir="auto" for the same reason as the spec table: 55" and
                  120 Hz keep their own direction inside an RTL page. */}
              <span dir="auto" className="truncate text-sm font-semibold">{fact.value}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ProductSummary({ summary }: { summary: string }) {
  if (!summary) return null;
  return (
    <section>
      <h2 className="mb-1.5 text-sm font-bold">כמה מילים על המוצר</h2>
      <p className="text-foreground/85 max-w-[65ch] leading-relaxed">{summary}</p>
    </section>
  );
}

// Titled features, without the card-per-paragraph treatment that made the
// page read as a stack of boxes. The only ornament is a hairline rule on
// the inline-start edge, which in RTL sits on the right where the eye
// starts — enough to separate one feature from the next, cheap enough to
// repeat six times without the section becoming heavy.
export function ProductFeatureList({ features }: { features: FeatureItem[] }) {
  if (features.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-bold">תכונות וטכנולוגיות</h2>
      <div className="flex flex-col gap-4">
        {features.map((feature, i) => (
          <div key={`${feature.title}-${i}`} className="border-brand/30 border-e-2 pe-3.5">
            <h3 className="text-sm font-bold">{feature.title}</h3>
            <p className="text-muted-foreground mt-0.5 max-w-[65ch] text-sm leading-relaxed">{feature.body}</p>
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
      <h2 className="mb-2.5 text-sm font-bold">{title}</h2>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
        {bullets.map((bullet, i) => (
          <li key={`${bullet}-${i}`} className="flex items-start gap-2 text-sm">
            <Check className="text-brand mt-[3px] size-3.5 shrink-0" />
            <span className="text-foreground/85 leading-snug">{bullet}</span>
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
        <p key={i} className="text-foreground/85 max-w-[65ch] text-sm leading-relaxed">
          {p}
        </p>
      ))}
    </div>
  );
}
