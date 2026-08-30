// Turns the free-text a product already carries into the structured pieces
// the product page renders: a short summary, titled feature blocks, and
// spec rows. Nothing here invents content — every string it returns is a
// substring of text already stored on the product. When a shape isn't
// recognised the text falls through to plain prose rather than being
// forced into a table, because a wrong spec on a retail page is a customer
// ordering something other than what they saw.
//
// Built against 45 real products spanning 24 categories (see
// scripts/check-product-content.ts, which runs this over that fixture set).
// Three description shapes actually occur, and the split matters:
//
//   heading/body   a short line with no full stop, then a longer line
//                  under it — JBL, Denon, Dyson. 9 of 45.
//   named feature  a paragraph opening "Lunar Dial - ..." or
//                  "Health Guard — ..." — Midea, LG. Common inside the
//                  multi-line shape too.
//   dense blob     one run-on paragraph of sentences, some of them
//                  "label: value" — Faber, Chromex, Vivitek. 33 of 45,
//                  so this is the shape to get right, not the pretty one.

// `kind` is only ever set for a yes/no attribute. It exists because such a
// row is readable in the spec table, where it sits next to its label, and
// meaningless in the highlight strip, which shows values on their own.
export type SpecRow = { label: string; value: string; kind?: "boolean" };
export type FeatureItem = { title: string; body: string };

export type ProductContent = {
  /** 2–4 lines. What the product is, for someone who will read nothing else. */
  summary: string;
  /** Title + explanation pairs, only where the text really carries both. */
  features: FeatureItem[];
  /** Short standalone lines — a bullet list in the source, shown as one. */
  bullets: string[];
  /** Real paragraphs: everything too long to be a bullet. */
  prose: string[];
  /** label/value pairs confidently parsed out of sentences. */
  specs: SpecRow[];
  /** The source text's own titled sections ("מפרט טכני:", "מאפיינים:"). */
  sections: ContentSection[];
};

export type ContentSection = {
  title: string;
  features: FeatureItem[];
  bullets: string[];
  prose: string[];
};

const SUMMARY_MAX = 240;
const TITLE_MAX = 70;
const NAMED_TITLE_MAX = 42;
const BODY_MIN = 45;
const SPEC_LABEL_MAX = 30;
const SPEC_VALUE_MAX = 70;
const MAX_FEATURES = 6;
const MAX_PARSED_SPECS = 14;
const BULLET_MAX = 90;
const MAX_BULLETS = 12;

const ENDS_SENTENCE = /[.!?:;]\s*$/;
const HAS_LETTER = /[A-Za-z֐-׿]/;
const HAS_DIGIT = /\d/;

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// A title is a label for what follows, not a sentence in its own right.
// The colon test matters: "אזור בישול שמאלי קדמי: אינדוקציה 210 מ\"מ" is a
// spec line, and pairing it with the next spec line as if it introduced
// one produced a confident-looking feature block that said nothing.
function looksLikeTitle(line: string): boolean {
  const t = clean(line);
  return (
    t.length > 0 &&
    t.length <= TITLE_MAX &&
    !ENDS_SENTENCE.test(t) &&
    !t.includes(":") &&
    HAS_LETTER.test(t)
  );
}

// A heading introduces something substantially longer than itself. Without
// that ratio, any two adjacent items in a bullet list pair up — confirmed
// on a real Dyson description, where "עם שני מצבים באחד" was given
// "מסרק שיניים רחב…" as its explanation, two unrelated siblings.
function isBodyFor(title: string, body: string): boolean {
  return body.length >= BODY_MIN && body.length >= title.length * 2;
}

// Source text carries its own section headers ("מאפיינים:", "תכונות:").
// They are structure, not content, and reading one as a paragraph puts a
// bare word on the page where a sentence belongs.
function isSectionHeader(line: string): boolean {
  const t = clean(line);
  return t.length <= 24 && /:$/.test(t) && t.split(/\s+/).length <= 3;
}

// "Lunar Dial - בורר תוכניות חכם…", "SOUND PRO — דיפיוזר המפחית…".
// The dash has to be surrounded by spaces: a hyphen inside a model number
// ("MF200W120W-B-W-IL") or a range ("5-10 שעות") is not a separator.
function splitNamedFeature(paragraph: string): FeatureItem | null {
  const p = clean(paragraph);
  const m = p.match(/^(.{2,42}?)\s+[-–—]\s+(.{45,})$/);
  if (!m) return null;
  const [, title, body] = m;
  if (title.length > NAMED_TITLE_MAX) return null;
  if (ENDS_SENTENCE.test(title)) return null;
  if (!HAS_LETTER.test(title)) return null;
  return { title: title.trim(), body: body.trim() };
}

// "עוצמת רעש: 52 / 61 / 66 / 69 dB(A)" is a spec. "מושלם למסיבות, חצר, ים
// ובריכה" is not, and neither is a sentence that merely happens to contain
// a colon. Requiring a short label, a short value, exactly one colon and a
// digit in the value is what keeps prose out of the spec table — the cost
// is missing a few real specs, which is the right way to be wrong here.
function parseSpecSentence(sentence: string): SpecRow | null {
  const s = clean(sentence);
  if ((s.match(/:/g) ?? []).length !== 1) return null;
  const [rawLabel, rawValue] = s.split(":");
  const label = clean(rawLabel);
  const value = clean(rawValue).replace(/[.,;]+$/, "");
  if (!label || !value) return null;
  if (label.length > SPEC_LABEL_MAX || value.length > SPEC_VALUE_MAX) return null;
  if (!HAS_LETTER.test(label)) return null;
  if (!HAS_DIGIT.test(value)) return null;
  // A label that is itself a full clause ("הנתונים והתמונות נלקחו מדף
  // המוצר הרשמי של Vivitek") is prose with a colon in it, not a field name.
  if (label.split(/\s+/).length > 4) return null;
  return { label, value };
}

// shortDescription is supposed to be the one-line pitch, and on this
// catalog it almost never is: 537 of the 543 live products that have one
// hold "צבע: שחור" — the colour, copied out of the supplier sheet. Printed
// under the heading "כמה מילים על המוצר" that is not a summary, it is a
// spec wearing a summary's clothes. So a field-name-and-value pair is
// recognised as what it is, sent to the spec table, and the summary comes
// from the product's real text instead.
//
// Looser than parseSpecSentence on purpose: that one insists on a digit in
// the value, which is right when mining prose for specs and wrong here —
// "שחור" is a perfectly good colour.
function parseLabelValue(text: string): SpecRow | null {
  const s = clean(text);
  if ((s.match(/:/g) ?? []).length !== 1) return null;
  const [rawLabel, rawValue] = s.split(":");
  const label = clean(rawLabel);
  const value = clean(rawValue).replace(/[.,;]+$/, "");
  if (!label || !value) return null;
  if (label.length > SPEC_LABEL_MAX || label.split(/\s+/).length > 3) return null;
  if (value.length > 40) return null;
  if (!HAS_LETTER.test(label)) return null;
  return { label, value };
}

// Sentence splitting that survives Hebrew technical text: a full stop
// inside "15,000:1" or "IP68." must not start a new sentence, and neither
// must the dot in a decimal or an abbreviation like "ס\"מ".
function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_BOUNDARY)
    .map(clean)
    .filter(Boolean);
}

// Two boundaries, not one. The first is the ordinary "terminator, space,
// next word". The second is the one these supplier descriptions keep
// losing — "…שדרוג מערכת ההפעלה לגרסה חדשה למשך 5 שנים.מסך בית…", a full
// stop welded to the word after it. Ignoring that boundary is a large part
// of why a 4,000-character LG description arrived as one block.
//
// The second rule is deliberately narrow: two letters before the stop, a
// Hebrew letter straight after it. That keeps "ס.מ" together, leaves
// "15,000:1" and "1.3 ליטר" alone, and never cuts inside a domain name.
// The digit in the first lookahead matters more than it looks: Hebrew
// marketing copy starts sentences with a number constantly ("4 מצבי גובה
// מתכווננים…", "12 תוכניות אוטומטיות…"), and without it a 419-character
// paragraph with seven full stops in it came out as one unsplittable
// block. A decimal point never has a space after it, so requiring the
// whitespace keeps "1.3 ליטר" intact. The asterisk and the direction
// marks are in there for the same reason: an LG description ends a
// sentence and opens the next one with "*תמונת המוצר נועדה להמחשה בלבד",
// and without them the disclaimer welds itself to the paragraph before it.
const SENTENCE_BOUNDARY =
  /(?<=[.!?])\s+(?=[A-Za-z֐-׿(0-9*\u200e\u200f\u2066"“”«])|(?<=[A-Za-z֐-׿]{2}[.!?])(?=[֐-׿])/;

function dedupe<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = keyOf(item).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// The supplier text carries its own section headings, and in the dense
// blob shape they sit inline: "…צלחת זכוכית מסתובבת עם רשת לגריל מאפיינים:
// מיקרוגל אינוורטר בילד אין…" — 1,674 characters with not one newline in
// them. Reading that as a single paragraph is exactly what it looked like
// on the Electrolux ECK5401K page: thirty lines of unbroken text with the
// spec list buried at the end of it.
//
// This list is the set of headings that actually occur in the catalog
// (counted over the published products), not a guess. Words that are spec
// labels rather than headings — "צבע:", "דגם:" — are deliberately absent:
// splitting there would cut a value away from its own field name.
const SECTION_HEADINGS = [
  "מפרט טכני",
  "נתונים טכניים",
  "מפרט",
  "מאפיינים",
  "תכונות עיקריות",
  "תכונות",
  "יתרונות נוספים",
  "יתרונות",
  "מידות חיצוניות",
  "מידות",
  "פרטים נוספים",
  "אביזרים",
  "בטיחות",
  "אחריות",
  "הערות",
  "כולל",
]
  .slice()
  // Longest first, so "מפרט טכני:" is matched as itself rather than as
  // "מפרט" followed by a stray "טכני".
  .sort((a, b) => b.length - a.length);

const HEADING_PATTERN = new RegExp(`(^|[\\s.,;:!?])(${SECTION_HEADINGS.join("|")})\\s*:\\s*`, "g");

// Puts every heading on a line of its own, so a one-line blob and a
// properly formatted multi-line description travel the same code path from
// here on.
function markSectionHeadings(text: string): string {
  return text.replace(HEADING_PATTERN, (_m, pre: string, heading: string) => `${pre}\n${heading}:\n`);
}

// A paragraph the length of a page is a wall of text whether or not it was
// one paragraph in the source. Cut it at sentence boundaries only — a
// paragraph with no sentence punctuation to cut on is left whole rather
// than broken mid-thought.
const PARAGRAPH_MAX = 320;

function splitLongParagraph(paragraph: string): string[] {
  if (paragraph.length <= PARAGRAPH_MAX) return [paragraph];
  const sentences = splitSentences(paragraph);
  if (sentences.length < 2) return [paragraph];
  const out: string[] = [];
  let buffer = "";
  for (const sentence of sentences) {
    if (buffer && buffer.length + sentence.length + 1 > PARAGRAPH_MAX) {
      out.push(buffer);
      buffer = sentence;
    } else {
      buffer = buffer ? `${buffer} ${sentence}` : sentence;
    }
  }
  if (buffer) out.push(buffer);
  return out;
}

type ParsedBody = { features: FeatureItem[]; bullets: string[]; prose: string[]; specs: SpecRow[] };

// Everything under one heading (or above the first one). Runs the same
// heading/body pairing, named-feature and sentence-mining passes the whole
// description used to get, so a section is not a second-class citizen.
function parseBody(lines: string[]): ParsedBody {
  const features: FeatureItem[] = [];
  const specs: SpecRow[] = [];
  const leftover: string[] = [];

  // Heading/body pairing only makes sense in text that actually alternates
  // between short labels and long explanations. A description that is
  // almost entirely short lines is a bullet list, and pairing consecutive
  // bullets invents a relationship the author never wrote — a real
  // Electrolux hob had "חיישני נגיעה עם צג לכל אזור" presented as the
  // heading for the product's own name. Below this threshold the lines are
  // kept as the list they are.
  const longLines = lines.filter((l) => l.length > BULLET_MAX).length;
  const allowPairing = lines.length > 1 && longLines / lines.length >= 0.25;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (allowPairing && next && looksLikeTitle(line) && isBodyFor(line, next)) {
      features.push({ title: line, body: next });
      i += 2;
      continue;
    }
    const named = splitNamedFeature(line);
    if (named) {
      features.push(named);
      i += 1;
      continue;
    }
    leftover.push(line);
    i += 1;
  }

  const prose: string[] = [];
  for (const paragraph of leftover) {
    const sentences = splitSentences(paragraph);
    const kept: string[] = [];
    for (const sentence of sentences) {
      const spec = parseSpecSentence(sentence);
      if (spec) {
        specs.push(spec);
        continue;
      }
      kept.push(sentence);
    }
    // A trailing "…טכנולוגיות היצרן: A — …; B — …; C — …" list is several
    // named features sharing one sentence. Split it only when every part
    // parses, so a sentence that merely contains a semicolon stays prose.
    const rejoined = kept.join(" ");
    const semiParts = rejoined.split(";").map(clean).filter(Boolean);
    if (semiParts.length >= 2) {
      const parsed = semiParts.map(splitNamedFeature);
      if (parsed.every((p): p is FeatureItem => p !== null)) {
        features.push(...parsed);
        continue;
      }
    }
    if (rejoined) prose.push(rejoined);
  }

  return { features, bullets: [], prose, specs };
}

// Short leftovers are bullets, long ones are paragraphs. Rendering 28
// one-line bullets as 28 paragraphs is the wall of text this whole module
// exists to stop.
function finalizeProse(prose: string[]): { bullets: string[]; paragraphs: string[] } {
  const bullets = dedupe(
    prose.filter((p) => p.length <= BULLET_MAX),
    (b) => b,
  ).slice(0, MAX_BULLETS);
  const paragraphs = prose.filter((p) => p.length > BULLET_MAX).flatMap(splitLongParagraph);
  return { bullets, paragraphs };
}

export function parseProductContent(
  description: string | null | undefined,
  shortDescription?: string | null,
): ProductContent {
  const shortSpec = parseLabelValue(shortDescription ?? "");
  const givenSummary = shortSpec ? "" : clean(shortDescription ?? "");

  const text = (description ?? "").trim();
  if (!text) {
    return {
      summary: givenSummary,
      features: [],
      bullets: [],
      prose: [],
      specs: shortSpec ? [shortSpec] : [],
      sections: [],
    };
  }

  const lines = markSectionHeadings(text).split("\n").map(clean).filter(Boolean);

  // The text above the first heading is the product's own introduction; each
  // heading opens a segment that keeps its title instead of the heading
  // being thrown away, which is what used to happen to it.
  const segments: { title: string | null; lines: string[] }[] = [{ title: null, lines: [] }];
  for (const line of lines) {
    if (isSectionHeader(line)) {
      segments.push({ title: line.replace(/:\s*$/, "").trim(), lines: [] });
      continue;
    }
    segments[segments.length - 1].lines.push(line);
  }

  const root = parseBody(segments[0].lines);
  const specs = shortSpec ? [shortSpec, ...root.specs] : [...root.specs];
  const sections: ContentSection[] = [];
  for (const segment of segments.slice(1)) {
    const body = parseBody(segment.lines);
    specs.push(...body.specs);
    const { bullets, paragraphs } = finalizeProse(body.prose);
    if (body.features.length === 0 && bullets.length === 0 && paragraphs.length === 0) continue;
    sections.push({ title: segment.title!, features: body.features, bullets, prose: paragraphs });
  }

  const features = root.features;
  const prose = root.prose;

  // The summary is the opening of the real text, cut at a sentence
  // boundary so it never breaks mid-word.
  let summary = givenSummary;
  if (!summary && prose.length > 0) {
    const sentences = splitSentences(prose[0]);
    const taken: string[] = [];
    let length = 0;
    for (const sentence of sentences) {
      if (taken.length > 0 && length + sentence.length + 1 > SUMMARY_MAX) break;
      taken.push(sentence);
      length += sentence.length + 1;
      if (length >= SUMMARY_MAX) break;
    }
    const joined = taken.join(" ");
    if (joined && joined.length <= SUMMARY_MAX) {
      summary = joined;
      // What is left of that paragraph goes back, rather than the paragraph
      // being dropped for having donated its opening. Dropping it lost the
      // entire body of a real Faber description — the summary was a 240-char
      // prefix and the remaining 600 characters, including the whole
      // manufacturer-technology list, simply vanished from the page.
      const remainder = sentences.slice(taken.length).join(" ").trim();
      if (remainder) prose[0] = remainder;
      else prose.shift();
    }
    // Otherwise the opening sentence on its own is longer than the entire
    // summary budget, and there is nothing to preview with: a cut-off copy
    // of it would print the same 240 characters directly above the
    // paragraph that contains them, which is exactly how the Electrolux
    // ECK5401K page opened. The paragraph speaks for itself instead.
  }
  // A product whose text is all headings and features has no opening
  // paragraph to summarise; borrow from what it does have rather than
  // leaving the top of the page empty.
  if (!summary && prose.length === 0) {
    summary = clean(features[0]?.body ?? sections[0]?.prose[0] ?? text).slice(0, SUMMARY_MAX);
    if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX).replace(/\s\S*$/, "") + "…";
  }

  const { bullets, paragraphs } = finalizeProse(prose);

  return {
    summary,
    features: dedupe(features, (f) => f.title).slice(0, MAX_FEATURES),
    bullets,
    prose: paragraphs,
    specs: dedupe(specs, (s) => s.label).slice(0, MAX_PARSED_SPECS),
    sections,
  };
}

// Merges the three real sources of spec rows into the one table the page
// shows, most trustworthy first, so a structured CategoryAttribute value
// always beats the same field scraped into extraSpecsRaw, which in turn
// beats one parsed out of a sentence.
const RAW_SPEC_SKIP = new Set(["מותג", "קטגוריה", "דגם", "מקור רשמי", "brand", "category", "model"]);

// The enrichment agent records a yes/no attribute as the boolean it read off
// the manufacturer's spec sheet, and the column is a string, so what lands in
// the database is the literal word "false" — 134 of them across 45 products,
// "true" on another 134. Left alone it prints an English keyword on a Hebrew
// page; in the highlight strip, which shows a value without its label, four
// of them printed as nothing but "false".
const BOOLEAN_TRUE = /^(true|yes|כן)$/i;
const BOOLEAN_FALSE = /^(false|no|לא)$/i;

function normalizeSpecValue(raw: string): { value: string; kind?: "boolean" } {
  const value = clean(raw);
  if (BOOLEAN_TRUE.test(value)) return { value: "כן", kind: "boolean" };
  if (BOOLEAN_FALSE.test(value)) return { value: "לא", kind: "boolean" };
  return { value };
}

export function buildSpecRows(
  attributeValues: { value: string; attribute: { label: string; unit: string | null; sortOrder: number } }[],
  extraSpecsRaw: string | null | undefined,
  parsedFromText: SpecRow[] = [],
): SpecRow[] {
  const fromAttributes: SpecRow[] = attributeValues
    .slice()
    .sort((a, b) => a.attribute.sortOrder - b.attribute.sortOrder)
    .map((av) => ({
      label: av.attribute.label,
      // A scraped value often already carries its unit ("1.3 ליטר"); only a
      // bare number is actually missing one.
      ...normalizeSpecValue(
        av.attribute.unit && /^\d+(\.\d+)?$/.test(av.value.trim())
          ? `${av.value} ${av.attribute.unit}`
          : av.value,
      ),
    }));

  let raw: Record<string, unknown> = {};
  if (extraSpecsRaw) {
    try {
      const parsed: unknown = JSON.parse(extraSpecsRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }
  const fromRaw: SpecRow[] = Object.entries(raw)
    .filter(([k, v]) => !RAW_SPEC_SKIP.has(k) && v !== null && v !== undefined && String(v).trim() !== "")
    .map(([label, value]) => ({ label: clean(label), ...normalizeSpecValue(String(value)) }));

  return dedupe([...fromAttributes, ...fromRaw, ...parsedFromText], (r) => r.label);
}

// Height/width/depth/weight get their own section, so they are lifted out
// of the main table rather than repeated in both.
export const DIMENSION_PATTERN = /גובה|רוחב|עומק|משקל|מידות|height|width|depth|weight|dimension/i;

export function splitDimensions(rows: SpecRow[]): { specs: SpecRow[]; dimensions: SpecRow[] } {
  const dimensions = rows.filter((r) => DIMENSION_PATTERN.test(r.label));
  const specs = rows.filter((r) => !DIMENSION_PATTERN.test(r.label));
  return { specs, dimensions };
}

// The four to six facts shown above the fold, as chips carrying the value
// alone. Not simply the first six spec rows: a yes/no row says nothing
// without its label ("לא"), and a value that needs a line and a half to
// itself is not something a shopper takes in at a glance.
//
// A "כן" is shown as its own label instead — "בלוטוס" with a tick is the
// fact; a "לא" is not a selling point and is left to the spec table, where
// it sits next to the field name and reads correctly.
const HIGHLIGHT_VALUE_MAX = 34;
const MIN_HIGHLIGHTS = 2;

export function pickHighlights(rows: SpecRow[], max = 6): SpecRow[] {
  const picked: SpecRow[] = [];
  for (const row of rows) {
    if (picked.length >= max) break;
    if (row.kind === "boolean") {
      if (row.value === "כן" && row.label.length <= HIGHLIGHT_VALUE_MAX) {
        picked.push({ ...row, value: row.label });
      }
      continue;
    }
    if (!row.value || row.value.length > HIGHLIGHT_VALUE_MAX) continue;
    picked.push(row);
  }
  // One lonely chip under a heading is more heading than fact.
  return picked.length >= MIN_HIGHLIGHTS ? picked : [];
}
