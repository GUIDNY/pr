/**
 * What a category page says about itself to a search result.
 *
 * Every one of 44 category pages carried the same sentence with the name
 * swapped in — "מגוון רחב במחירים הטובים ביותר, משלוח עד הבית ואחריות
 * יבואן רשמי" — at 77–88 characters of the ~155 a result shows. A
 * description is the one line a searcher reads before choosing between
 * ten results, and a line that could be any shop's says nothing. The one
 * built here says what is on the shelf: how many models, from what price,
 * which makers, and from page 2 which page it is, so fifty paginated pages
 * are not fifty identical titles.
 *
 * Numbers come from the live shelf (getCategoryMetaFacts), never typed in.
 */

export type CategoryFacts = {
  /** Live products in the category's scope (itself and its children). */
  count: number;
  minPrice: number | null;
  /** Brand names by live-product count, most first. */
  topBrands: string[];
};

const price = (n: number) => `${Math.round(n).toLocaleString("he-IL")} ₪`;

export function categoryPageTitle(name: string, page = 1): string {
  return page > 1 ? `${name} – עמוד ${page}` : name;
}

export function categoryMetaDescription(name: string, facts: CategoryFacts, page = 1): string {
  const parts: string[] = [];
  const brands = facts.topBrands.slice(0, 3);
  if (facts.count > 0) {
    const from = facts.minPrice !== null && facts.minPrice > 0 ? ` החל מ-${price(facts.minPrice)}` : "";
    parts.push(`${facts.count.toLocaleString("he-IL")} דגמי ${name} במלאי${from}`);
    if (brands.length > 0) parts.push(brands.join(", "));
  } else {
    parts.push(`${name} ב-Buy Today`);
  }
  const lead = parts.join(" — ");
  const tail = "משלוח עד הבית ואחריות יבואן רשמי.";
  const pageNote = page > 1 ? ` עמוד ${page}.` : "";
  const text = `${lead}. ${tail}${pageNote}`;
  return text.length <= 160 ? text : `${lead}.${pageNote}`;
}
