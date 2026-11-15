/**
 * "בלאק נובמבר" — which products are in it, and what may be said about them.
 *
 * The supplier marks the rows himself: the price list's "הערות+מבצעים" cell
 * reads "מבצע BLACK FRIDAY" on the televisions he is running the offer on
 * (19 rows of the מסכים tab on 15 November, all LG). The sync already keeps
 * the whole row, cell for cell, in `Product.stockBreakdown` and rewrites it
 * on every run — so the mark arrives twice a day with everything else, and a
 * product joins or leaves the homepage section when the supplier adds or
 * removes the words. Nothing here is a list anybody has to maintain, and
 * nothing is written to a product.
 *
 * What the section says is the owner's decision of 16 November, in his words:
 * "פשוט תרשום מחיר זמני, אל תעשה הנחה ואיקס". So the price shown is the
 * price the product already has, there is no struck-through number and no
 * percentage, and the label claims only that the price is for a limited
 * time — never that it came down from something.
 */

/* Every spelling the mark could arrive in. Matched case-insensitively
   against the row snapshot. Deliberately not "BF": two letters turn up
   inside model codes. */
export const BLACK_NOVEMBER_ROW_MARKS = ["BLACK FRIDAY", "בלאק פריידי", "בלאק פרייד"] as const;

export const BLACK_NOVEMBER_LABEL = "מחיר בלאק נובמבר";
export const BLACK_NOVEMBER_LIMITED = "לזמן מוגבל";

/**
 * What the section may say it is a sale *of*, read off the products in it.
 *
 * On 16 November every marked row is an LG television, and the owner asked
 * for the heading to say so. It is derived rather than typed because the
 * list is the supplier's: the day he marks a Samsung or a fridge, a heading
 * that still says "LG televisions" is a false statement on the homepage, and
 * nobody would be editing this file that morning.
 */
export function blackNovemberScope(products: { title: string; brandName: string }[]): {
  headline: string;
  note: string | null;
} {
  const brands = new Set(products.map((p) => p.brandName));
  const allTelevisions = products.length > 0 && products.every((p) => p.title.trim().startsWith("טלוויזי"));
  const brand = brands.size === 1 ? [...brands][0] : null;

  if (allTelevisions && brand) {
    return {
      headline: `טלוויזיות ${brand} במחירי בלאק נובמבר`,
      note: `בינתיים המבצע על טלוויזיות ${brand} בלבד.`,
    };
  }
  if (allTelevisions) return { headline: "טלוויזיות במחירי בלאק נובמבר", note: null };
  if (brand) return { headline: `מוצרי ${brand} במחירי בלאק נובמבר`, note: null };
  return { headline: "מוצרים נבחרים במחירי בלאק נובמבר", note: null };
}
