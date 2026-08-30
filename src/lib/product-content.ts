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

export type SpecRow = { label: string; value: string };
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

// Sentence splitting that survives Hebrew technical text: a full stop
// inside "15,000:1" or "IP68." must not start a new sentence, and neither
// must the dot in a decimal or an abbreviation like "ס\"מ".
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Za-z֐-׿(])/)
    .map(clean)
    .filter(Boolean);
}

function dedupe<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const k = keyOf(item).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function parseProductContent(
  description: string | null | undefined,
  shortDescription?: string | null,
): ProductContent {
  const empty: ProductContent = { summary: clean(shortDescription ?? ""), features: [], bullets: [], prose: [], specs: [] };
  const text = (description ?? "").trim();
  if (!text) return empty;

  const lines = text.split("\n").map(clean).filter(Boolean);
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

  // --- heading/body pairs, only available when the text has real lines ---
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];
    if (isSectionHeader(line)) {
      i += 1;
      continue;
    }
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

  // --- inside whatever is left, mine sentences for specs and features ---
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

  // The summary is the opening of the real text, cut at a sentence
  // boundary so it never breaks mid-word.
  let summary = clean(shortDescription ?? "");
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
    summary = taken.join(" ");

    if (summary.length > SUMMARY_MAX) {
      // One sentence can be longer than the whole budget. Cut the preview
      // at a word boundary and leave the sentence itself untouched below,
      // so the shopper still gets the full text — a summary is a preview,
      // never a replacement.
      summary = summary.slice(0, SUMMARY_MAX).replace(/\s\S*$/, "") + "…";
      if (prose[0]) prose[0] = sentences.join(" ");
    } else {
      // What is left of that paragraph goes back, rather than the paragraph
      // being dropped for having donated its opening. Dropping it lost the
      // entire body of a real Faber description — the summary was a 240-char
      // prefix and the remaining 600 characters, including the whole
      // manufacturer-technology list, simply vanished from the page.
      const remainder = sentences.slice(taken.length).join(" ").trim();
      if (remainder) prose[0] = remainder;
      else prose.shift();
    }
  }
  // A single-sentence description would otherwise be shown twice: once as
  // the summary and again as the only paragraph under it.
  if (!summary) summary = clean(features[0]?.body ?? text).slice(0, SUMMARY_MAX);
  if (summary.length > SUMMARY_MAX) summary = summary.slice(0, SUMMARY_MAX).replace(/\s\S*$/, "") + "…";

  // Short leftovers are bullets, long ones are paragraphs. Rendering 28
  // one-line bullets as 28 paragraphs is the wall of text this whole
  // module exists to stop.
  const bullets = dedupe(
    prose.filter((p) => p.length <= BULLET_MAX),
    (b) => b,
  ).slice(0, MAX_BULLETS);
  const paragraphs = prose.filter((p) => p.length > BULLET_MAX);

  return {
    summary,
    features: dedupe(features, (f) => f.title).slice(0, MAX_FEATURES),
    bullets,
    prose: paragraphs,
    specs: dedupe(specs, (s) => s.label).slice(0, MAX_PARSED_SPECS),
  };
}

// Merges the three real sources of spec rows into the one table the page
// shows, most trustworthy first, so a structured CategoryAttribute value
// always beats the same field scraped into extraSpecsRaw, which in turn
// beats one parsed out of a sentence.
const RAW_SPEC_SKIP = new Set(["מותג", "קטגוריה", "דגם", "מקור רשמי", "brand", "category", "model"]);

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
      value: av.attribute.unit && /^\d+(\.\d+)?$/.test(av.value.trim())
        ? `${av.value} ${av.attribute.unit}`
        : av.value,
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
    .map(([label, value]) => ({ label: clean(label), value: clean(String(value)) }));

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
