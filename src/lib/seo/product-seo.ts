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
 * Measured on the 2,734 live products: 2,232 name a code the title names,
 * 413 titles carry no code at all (the SEO title is used), 89 fall back —
 * most of those to a title that is fine anyway.
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

export function productSearchSnippet(product: {
  title: string;
  seoTitle: string | null;
  seoDesc: string | null;
  shortDescription: string | null;
  description: string | null;
}): { title: string; description: string | undefined } {
  const plain = {
    title: product.title,
    description: product.shortDescription ?? product.description ?? undefined,
  };
  const seoTitle = product.seoTitle?.trim();
  if (!seoTitle || !namesSameModel(seoTitle, product.title)) return plain;
  return {
    title: seoTitle,
    description: product.seoDesc?.trim() || plain.description,
  };
}
