/**
 * Products whose installation is charged separately and arranged after the
 * order.
 *
 * The owner, 8 November: built-in ovens, ovens in general and induction
 * cooktops carry a notice on the product page, prominent, that installation
 * costs extra after the order and that the shop will call about it. Said
 * before the buy button, not after the payment — an installation fee a
 * customer first hears about on the phone is a surprise charge, and a
 * surprise charge is a cancelled order.
 *
 * By leaf category, which is what decides the kind of appliance here:
 *   built-in-oven       תנור בנוי
 *   combi-oven          תנור משולב (free-standing oven with a hob)
 *   induction-cooktops  כיריים אינדוקציה
 *   hybrid-cooktops     כיריים משולבות גז ואינדוקציה — induction too
 * Not toaster-ovens (a countertop appliance, nothing to install) and not
 * heaters (תנורי חימום, a different "תנור"). Gas and ceramic cooktops were
 * not asked about; adding a slug here is the whole change.
 */
export const PAID_INSTALLATION_CATEGORY_SLUGS: readonly string[] = [
  "built-in-oven",
  "combi-oven",
  "induction-cooktops",
  "hybrid-cooktops",
];

export function needsPaidInstallation(categorySlug: string | null | undefined): boolean {
  return !!categorySlug && PAID_INSTALLATION_CATEGORY_SLUGS.includes(categorySlug);
}
