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

/**
 * The title of a category page.
 *
 * Page 1 used to be the bare name — "מיקרוגלים" — while the description
 * under it already said how many models and from what price. In a search
 * result the title is the line that is read and the description is the
 * line that is skimmed, and Search Console (28 days to 12 November) had
 * the category pages at hundreds of impressions and no clicks on exactly
 * these words: "מיקרוגלים" 215 and 0, "טוסטר אובן" 176 and 0, "טלוויזיה"
 * 250 and 0. Every shop on the first page for them says more than the
 * name in its title.
 *
 * So the same two live numbers go into the title, and only those: nothing
 * typed in, no "מבצע" that is not one. It will not move a page from
 * position 50 by itself — that is a question of who links to the shop —
 * but it is what a searcher sees on the day the page does get there.
 *
 * Kept under ~50 characters so the root layout's " | Buy Today" still fits
 * in a result; a long category name keeps the count and drops the price,
 * and a very long one stays as it was. From page 2 the title is the page
 * number, as before, so fifty paginated pages are not fifty identical
 * titles.
 */
const TITLE_BUDGET = 50;

export function categoryPageTitle(name: string, page = 1, facts?: CategoryFacts): string {
  if (page > 1) return `${name} – עמוד ${page}`;
  if (!facts || facts.count <= 0) return name;
  const models = `${name} – ${facts.count.toLocaleString("he-IL")} דגמים`;
  const withPrice =
    facts.minPrice !== null && facts.minPrice > 0 ? `${models} החל מ-${price(facts.minPrice)}` : models;
  if (withPrice.length <= TITLE_BUDGET) return withPrice;
  return models.length <= TITLE_BUDGET ? models : name;
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
