import type { ReactNode } from "react";

// The enrichment agent writes its descriptions in markdown, and the page
// rendered them as plain text — so a line meant as a heading arrived on the
// product page reading literally
//
//   **במה היא שונה מ-QNED באותו מחיר:**
//
// asterisks and all. This turns the one piece of markup that actually turns
// up in this catalog into what it was meant to be, and removes the marks.
//
// Deliberately not a markdown library and not a general parser: the text
// being rendered is product copy from an outside source, so the smallest
// thing that solves the actual problem is also the one with nothing to
// exploit. `**text**` becomes bold; everything else is a string.
const BOLD = /\*\*(.+?)\*\*/g;

// A `**` with no partner cannot be rendered as anything, and leaving it in
// is the bug this component exists to fix — so it comes out of the plain
// runs too. Single asterisks stay: they are real punctuation here, opening
// the disclaimer line ("*תמונות המוצר המוצגות…") on a lot of products.
export function stripBoldMarks(text: string): string {
  return text.replace(/\*\*/g, "");
}

export function InlineMarkdown({ text }: { text: string }) {
  if (!text.includes("**")) return <>{text}</>;

  const parts: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(BOLD)) {
    const at = match.index ?? 0;
    if (at > cursor) parts.push(stripBoldMarks(text.slice(cursor, at)));
    parts.push(
      <strong key={at} className="font-bold">
        {match[1]}
      </strong>,
    );
    cursor = at + match[0].length;
  }
  parts.push(stripBoldMarks(text.slice(cursor)));
  return <>{parts}</>;
}
