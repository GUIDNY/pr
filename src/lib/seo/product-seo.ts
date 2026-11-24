/**
 * What a product page tells a search engine its title and summary are.
 *
 * `Product.seoTitle` and `seoDesc` are filled on every live product — 2,734
 * of 2,734 on 20 November — and were read by nothing. The page metadata
 * took `title` and `shortDescription`, so the 19 search titles rewritten on
 * 16 November from Search Console (model code first, because the queries
 * are model codes) never reached a result page.
 *
 * The SEO title is used only when it still names a model code the product's
 * own title names. The title is the field corrections land on — a wrong
 * model fixed against the manufacturer is fixed there — so a search title
 * that names a different code may be describing a different product, and
 * the plain title is the safer answer. Checked against the title rather
 * than `Product.model`, which holds regional and padded codes
 * (`QE65QN70FAUXIL`, `75U8000H 4K`) that a good search title never spells.
 * A shortened code counts (`KLF03` for `KLF03RDEU`): the supplier suffix is
 * colour, and the search title drops it on purpose.
 *
 * Measured on the 2,734 live products: 2,262 name a code the title names,
 * 413 titles carry no code at all (the SEO title is used), 59 fall back to
 * the plain title.
 *
 * The description travels with the title: one is not trusted without the
 * other.
 */
const UNIT = /^\d+(HZ|W|KW|L|BTU|KG|CM|MM|MP|GB|TB|V|DB|RPM)$/;

function squash(s: string): string {
  return s.toUpperCase().replace(/[\s\-_./]/g, "");
}

/** Model-like codes in a string: letters and digits together, 4+ characters, not a unit. */
export function modelCodes(text: string): string[] {
  const out: string[] = [];
  for (const word of text.match(/[A-Za-z0-9][A-Za-z0-9.\-/]*[A-Za-z0-9]/g) ?? []) {
    const code = squash(word);
    if (code.length >= 4 && /[A-Z]/.test(code) && /\d/.test(code) && !UNIT.test(code)) out.push(code);
  }
  return out;
}

function namesSameModel(seoTitle: string, title: string): boolean {
  const titleCodes = modelCodes(title);
  if (titleCodes.length === 0) return true;
  const seo = squash(seoTitle);
  if (titleCodes.some((c) => seo.includes(c))) return true;
  return modelCodes(seoTitle).some((s) => s.length >= 5 && titleCodes.some((c) => c.startsWith(s)));
}

/**
 * The whole search title is meant to fit in 60 characters, and the site
 * template adds " | Buy Today" (12 with its spaces), so the product part gets
 * 48. A title whose full form is already at most 60 is returned as it is.
 *
 * Only the <title> goes through this. Product.title, the H1 and the JSON-LD
 * name are the product's own words and are never shortened.
 */
export const SEARCH_TITLE_MAX = 48;

/* Words a title must not end on: they open a phrase the next word completes
   ("עם פאנל", "בנפח 4.7", "ברוחב 75"), so cutting there leaves a sentence with
   no end. Hebrew measure prepositions are matched by shape (ב/ל + noun). */
const DANGLING = new Set(["עם", "של", "מתאים", "מתאימה", "עד", "כולל", "ללא", "או", "גופי", "+", "-", "–", "—", "|", "/", "&"]);
const MEASURE_PREPOSITION = /^(?:ב(?:נפח|גודל|הספק|רוחב|גובה|עומק|קוטר|עוצמת|צבע|מסוג)|מסוג|ל-?|ו-?)$/;
const LATIN = /^[A-Za-z][A-Za-z0-9.+-]*$/;
/* A word that completes a measurement ("71 ליטר", "60 ס״מ", "2400W", "4K"): a good
   place to stop, because the number before it is whole. */
const UNIT_WORD = /^(?:ליטר|ס["״]מ|מ["״]מ|ק["״]ג|אינץ['׳]?|ואט|BTU|\d+(?:\.\d+)?(?:W|KW|HZ|DB|MM|CM|KG|L|K))$/i;

/**
 * Shorten a search title to at most `max` characters by dropping whole words
 * from the end. Never shortens past the last word that names the brand or a
 * model code, never cuts a word, adds no "…", leaves no word dangling, and
 * drops a second copy of the brand. When the brand and model alone do not fit,
 * the title is returned unshortened: longer is better than losing the model.
 */
export function fitSearchTitle(rawTitle: string, brand: string | null | undefined, max: number = SEARCH_TITLE_MAX): string {
  // The site template appends " | Buy Today"; a title that carries it already would show it twice.
  const title = rawTitle.replace(/\s*[|–—-]\s*Buy Today\s*$/i, "");
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return title;
  const brandKey = brand ? squash(brand) : "";
  // The second mention of the brand is a repeat, not information.
  let seenBrand = false;
  const words = clean.split(" ").filter((w) => {
    if (!brandKey || squash(w) !== brandKey) return true;
    if (seenBrand) return false;
    seenBrand = true;
    return true;
  });
  const joined = words.join(" ");
  if (joined.length <= max) return joined;

  // The last word that must survive: the brand, or anything that looks like a model code.
  let keep = -1;
  words.forEach((w, i) => {
    const isBrand = brandKey !== "" && squash(w) === brandKey;
    if (isBrand || modelCodes(w).length > 0) keep = i;
  });
  let end = words.length;
  while (end > keep + 1 && end > 1 && words.slice(0, end).join(" ").length > max) end--;
  // Take back words that cannot end a title.
  const dangling = (i: number): boolean => {
    const w = words[i];
    if (DANGLING.has(w) || MEASURE_PREPOSITION.test(w) || /^[\d.,]+$/.test(w) || /^[לבו]-/.test(w)) return true;
    // Cut inside an English phrase ("No | Frost", "Full | Touch"): both neighbours are Latin words.
    const next = words[i + 1];
    return i + 1 < words.length && LATIN.test(w) && next !== undefined && LATIN.test(next) && i > keep;
  };
  while (end > keep + 1 && end > 1 && dangling(end - 1)) end--;
  // A measurement just before the cut is the natural end: drop the one or two loose words after it.
  for (let k = end - 1; k > keep && k >= end - 3; k--) {
    if (UNIT_WORD.test(words[k])) {
      end = k + 1;
      break;
    }
  }
  const out = words.slice(0, end).join(" ").replace(/[\s,;:\-–|/+&]+$/u, "");
  if (out.length > max) return joined; // brand + model alone do not fit
  return out;
}

export function productSearchSnippet(product: {
  title: string;
  seoTitle: string | null;
  seoDesc: string | null;
  shortDescription: string | null;
  description: string | null;
  brand?: { name: string } | null;
}): { title: string; description: string | undefined } {
  const plain = {
    title: fitSearchTitle(product.title, product.brand?.name),
    description: product.shortDescription ?? product.description ?? undefined,
  };
  const seoTitle = product.seoTitle?.trim();
  if (!seoTitle || !namesSameModel(seoTitle, product.title)) return plain;
  return {
    title: fitSearchTitle(seoTitle, product.brand?.name),
    description: product.seoDesc?.trim() || plain.description,
  };
}
