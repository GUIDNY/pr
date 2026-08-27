import { Check } from "lucide-react";

const HIGHLIGHT_MAX_LENGTH = 50;
const MAX_HIGHLIGHTS = 8;

export type ParsedDescription = { highlights: string[]; prose: string[] };

// Real scraped descriptions consistently open with a run of short, punchy
// feature lines before the actual prose kicks in — confirmed on real data:
// "שליטה באמצעות אפליקציית Klipsch" / "צליל בס עמוק ועוצמתי" / "מתוכנן
// בקפידה עד הפרט האחרון" / ... Treating those as plain paragraph text (the
// old behavior) buries them in a wall of prose. Pulling that leading run
// into its own highlight grid is what actually gives the page the
// "structured, scannable" feel a wall-of-text can't — using only content
// that's already there, not invented copy.
//
// Exported (not just used internally by ProductDescriptionText below) so
// the product page can render the highlights grid and the prose in two
// different places in its layout without re-implementing this split —
// one parser, two render call sites.
export function parseProductDescription(text: string): ParsedDescription {
  let lines = text
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean);

  if (lines.length === 0) return { highlights: [], prose: [] };

  // Some scraped descriptions arrive as a single dense line with no
  // paragraph breaks at all (confirmed on real data — e.g. the LG
  // MH8295DIS description is one 190-char run-on sentence). Splitting it
  // on its comma-separated clauses turns that one wall-of-text blob into
  // several real paragraphs — still exactly the text that was already
  // there, just formatted so it reads as more than one flat line.
  if (lines.length === 1 && lines[0].length > 120) {
    const clauses = lines[0]
      .split(/,\s+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (clauses.length >= 2) {
      // One clause per paragraph looked broken on a comma-dense
      // description (many short clauses — "84 ס״מ, לבן, נירוסטה, אנרגיה
      // A+, ..." — confirmed reported: each became its own sparse,
      // disconnected-looking block). Accumulate consecutive clauses into
      // a paragraph until it's actually long enough to read as real
      // prose, instead of splitting on every single comma.
      const MIN_PARAGRAPH_LENGTH = 60;
      const grouped: string[] = [];
      let current: string[] = [];
      let currentLength = 0;
      for (const clause of clauses) {
        current.push(clause);
        currentLength += clause.length;
        if (currentLength >= MIN_PARAGRAPH_LENGTH) {
          grouped.push(current.join(", "));
          current = [];
          currentLength = 0;
        }
      }
      if (current.length > 0) {
        // A too-short leftover tail reads better folded into the previous
        // paragraph than standing alone as its own tiny one.
        if (grouped.length > 0) grouped[grouped.length - 1] += ", " + current.join(", ");
        else grouped.push(current.join(", "));
      }
      lines = grouped.map((p, i) => (i < grouped.length - 1 ? `${p},` : p));
    }
  }

  let i = 0;
  while (
    i < lines.length &&
    i < MAX_HIGHLIGHTS &&
    lines.length - i > 1 && // never treat the whole description as "highlights" — some prose must remain
    lines[i].length <= HIGHLIGHT_MAX_LENGTH &&
    !/[.!?]$/.test(lines[i])
  ) {
    i++;
  }
  return i >= 2 ? { highlights: lines.slice(0, i), prose: lines.slice(i) } : { highlights: [], prose: lines };
}

export function ProductHighlightsGrid({ highlights }: { highlights: string[] }) {
  if (highlights.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
      {highlights.map((h, i) => (
        <div key={i} className="border-border bg-card hover:border-brand/30 flex items-start gap-2.5 rounded-xl border p-3 shadow-sm transition-colors">
          <span className="bg-brand/15 text-brand mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full">
            <Check className="size-3.5" />
          </span>
          <span className="text-sm leading-snug font-medium [overflow-wrap:anywhere]">{h}</span>
        </div>
      ))}
    </div>
  );
}

export function ProductProseText({ prose }: { prose: string[] }) {
  if (prose.length === 0) return null;
  return (
    <div className="flex flex-col gap-3.5">
      {prose.map((p, i) => (
        // Descriptions carry model numbers and the occasional bare URL —
        // strings with no space in them for the browser to break at, which
        // otherwise set the width of the whole page on a phone.
        <p
          key={i}
          className={
            i === 0
              ? "text-foreground text-lg leading-relaxed font-medium text-balance [overflow-wrap:anywhere]"
              : "text-foreground/85 leading-relaxed [overflow-wrap:anywhere]"
          }
        >
          {p}
        </p>
      ))}
    </div>
  );
}

// Scraped/enriched descriptions come in as real multi-line text (confirmed
// on real data — line breaks between feature bullets and paragraphs), but a
// plain text node collapses all of that into one run-on wall of text since
// React doesn't preserve whitespace by default. Splitting on newlines and
// giving each line real paragraph spacing is what actually fixes the
// wall-of-text look. Combined renderer (highlights grid + prose together)
// — used wherever the layout doesn't need them positioned separately, e.g.
// BrandAboutSection's "about the brand" text.
export function ProductDescriptionText({ text }: { text: string }) {
  const { highlights, prose } = parseProductDescription(text);
  if (highlights.length === 0 && prose.length === 0) return null;

  return (
    <div className="flex flex-col gap-6">
      <ProductHighlightsGrid highlights={highlights} />
      <ProductProseText prose={prose} />
    </div>
  );
}
