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
