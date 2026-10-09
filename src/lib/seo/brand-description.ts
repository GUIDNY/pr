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
export function brandMetaDescription(name: string, total: number): string {
  const what =
    total > 0
      ? `${total} מוצרי ${name} במלאי`
      : `מוצרי ${name}`;
  return (
    `${what} ב-Buy Today — מקררים, מכונות כביסה, תנורים, טלוויזיות ומוצרי חשמל נוספים. ` +
    `מחירים מעודכנים, משלוח עד הבית ואחריות יבואן רשמי.`
  );
}
