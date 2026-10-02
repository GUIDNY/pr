/**
 * SKUs that exist so a person can put a real card through the real gateway.
 *
 * A payment lane cannot be proved from a staging copy — there isn't one —
 * and it cannot be proved by reading the code either. Somebody has to buy
 * something, watch the money move, and see the order land in the back
 * office. That needs a product that is genuinely purchasable, which on this
 * site means published, in stock and carrying an image, because those three
 * are what PUBLIC_PRODUCT_WHERE asks for.
 *
 * Genuinely purchasable also means genuinely visible, and one surface is
 * worth keeping it off: the Google Merchant feed. Everything else it leaks
 * into — a category listing, the search box, the sitemap — is a customer
 * seeing an odd ₪1 row for as long as the test runs, and that is over in
 * minutes. Merchant Center is on its own daily schedule that nobody here
 * controls, so an item that appears for ten minutes can still be the one
 * Google happens to fetch, and a shekel-priced "בדיקה" in a feed of
 * appliances is exactly the row a reviewer stops on.
 *
 * Excluding it there costs nothing: the feed's rule is that it must agree
 * with the shop, and a product missing from the feed disagrees with nothing.
 * The rule that matters is the opposite one — never advertise something the
 * page contradicts.
 *
 * Kept in code rather than as a column so it is visible in review and hard
 * to leave behind: an unused entry here is a line in a diff, where a stray
 * flag on a row is nothing at all.
 */
export const TEST_PRODUCT_SKUS: readonly string[] = ["TEST-PAY-001"];

export function isTestProduct(sku: string): boolean {
  return TEST_PRODUCT_SKUS.includes(sku);
}
