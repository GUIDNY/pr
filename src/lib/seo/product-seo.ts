/**
 * What a product page tells a search engine its title and summary are.
 *
 * `Product.seoTitle` and `seoDesc` are filled on every live product — 2,734
 * of 2,734 on 20 November — and were read by nothing. The page metadata
 * took `title` and `shortDescription`, so the 19 search titles rewritten on
 * 16 November from Search Console (model code first, because the queries
 * are model codes) never reached a result page.
 *
 * The SEO title is used only when it still names the product's model. The
 * title is the field corrections land on — a wrong model fixed against the
 * manufacturer is fixed there — and 108 live products had a seoTitle that
 * no longer carried the model their title does. A search title naming a
 * different product is worse than the plain title, so those fall back.
 * The description travels with the title: one is not trusted without the
 * other.
 */
function squash(s: string): string {
  return s.toUpperCase().replace(/[\s\-_./]/g, "");
}

export function productSearchSnippet(product: {
  title: string;
  model: string | null;
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
  if (!seoTitle) return plain;
  const model = product.model?.trim();
  if (model && model.length >= 3 && !squash(seoTitle).includes(squash(model))) return plain;
  return {
    title: seoTitle,
    description: product.seoDesc?.trim() || plain.description,
  };
}
