/**
 * The day the returns policy last changed, in one place.
 *
 * The page prints it and the sitemap dates the URL with it. Two copies would
 * drift, and the sitemap's copy is the one nobody would notice going stale —
 * a policy page is exactly the kind of URL a crawler will not revisit unless
 * its date says something happened.
 *
 * Update this whenever the wording changes — and remember the wording is also
 * held in Merchant Center, which compares the two.
 */
export const RETURNS_POLICY_UPDATED = new Date("2026-09-07T00:00:00Z");

export const RETURNS_POLICY_UPDATED_LABEL = "07.09.2026";

/**
 * The cancellation window, in days.
 *
 * Israel's Consumer Protection Law, which is why it is fourteen and why
 * nobody gets to shorten it. Named here rather than typed into the product
 * schema because the /returns page, the Merchant Center account and the
 * JSON-LD all have to say the same number, and a literal in three files is
 * three numbers waiting to disagree.
 */
export const RETURN_WINDOW_DAYS = 14;

/**
 * What cancelling a sound product actually costs the customer: 5% of the
 * price or 100 shekels, whichever is lower.
 *
 * A function rather than a constant because the two halves swap over at
 * 2,000 shekels — below it the percentage is lower, above it the cap is —
 * and this catalogue sells on both sides of that line. Publishing a flat 5%
 * would overstate the fee on a fridge and a flat 100 would overstate it on
 * a kettle, and a fee a customer can check has to be the one they would be
 * charged.
 *
 * Faulty goods carry no fee at all and are collected at our expense; that
 * is on the /returns page and is not what this describes.
 */
export const CANCELLATION_FEE_RATE = 0.05;
export const CANCELLATION_FEE_CAP = 100;

export function cancellationFee(price: number): number {
  return Math.min(price * CANCELLATION_FEE_RATE, CANCELLATION_FEE_CAP);
}
