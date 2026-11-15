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
