/**
 * The day the shipping policy last changed, in one place.
 *
 * Same reasoning as returns-policy.ts: the page prints it and the sitemap
 * dates the URL with it. Two copies would drift, and the sitemap's is the
 * one nobody notices going stale — a policy page is exactly the kind of URL
 * a crawler will not revisit unless its date says something happened.
 *
 * Update this when the wording changes, and remember the wording is also
 * held in Merchant Center, which compares the two.
 */
export const SHIPPING_POLICY_UPDATED = new Date("2026-10-14T00:00:00Z");

export const SHIPPING_POLICY_UPDATED_LABEL = "14.10.2026";
