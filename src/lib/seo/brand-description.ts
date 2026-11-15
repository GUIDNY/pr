/**
 * The sentence a brand page offers a search result.
 *
 * `Brand.description` is a tagline — Bosch's is "הנדסה גרמנית מדויקת, מאז
 * 1886", twenty-nine characters — and a meta description that short is one
 * Google replaces with a snippet of its own choosing. This is a template
 * rather than ninety hand-written lines, for the same reason the category
 * descriptions are: a line per brand would be written once and never
 * revised, and the count in it would be wrong by the following week.
 *
 * It lands between 120 and 160 characters for every brand name this
 * catalogue holds, which is the window a result actually prints.
 */
/*
 * The middle of the sentence used to be a constant — "מקררים, מכונות כביסה,
 * תנורים, טלוויזיות ומוצרי חשמל נוספים" — on every brand page. Two things
 * were wrong with that, measured on 15 November. It was false for most of
 * them: /brand/trust holds three fans and kettles and said refrigerators,
 * washing machines, ovens and televisions. And it made all 84 indexable
 * brand pages offer the same sentence with a name and a number swapped in,
 * which is the complaint the header above makes about `Brand.description`
 * and the one category-description.ts was written to end for categories.
 * Search Console's "not indexed" list held 48 brand pages that day.
 *
 * So the middle is now the categories the brand really has live products
 * in, most first, from getBrandTopCategories. With none to name it says
 * nothing rather than something untrue.
 */
const TAIL = "מחירים מעודכנים, משלוח עד הבית ואחריות יבואן רשמי.";

export function brandMetaDescription(name: string, total: number, categories: readonly string[] = []): string {
  const what =
    total > 0
      ? `${total} מוצרי ${name} במלאי`
      : `מוצרי ${name}`;
  /* Fewer names rather than a cut-off one: drop from the end until the
     whole line fits what a result prints. */
  for (let n = Math.min(categories.length, 4); n > 0; n--) {
    const text = `${what} ב-Buy Today — ${categories.slice(0, n).join(", ")}. ${TAIL}`;
    if (text.length <= 160) return text;
  }
  return `${what} ב-Buy Today. ${TAIL}`;
}
