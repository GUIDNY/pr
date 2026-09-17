/**
 * The day the old-appliance removal page last changed, in one place.
 *
 * Same reasoning as returns-policy.ts and shipping-policy.ts: the page prints
 * it and the sitemap dates the URL with it. Two copies drift, and the
 * sitemap's is the one nobody notices going stale — a policy page is exactly
 * the kind of URL a crawler will not revisit unless its date says something
 * happened.
 */
export const REMOVAL_POLICY_UPDATED = new Date("2026-09-17T00:00:00Z");

export const REMOVAL_POLICY_UPDATED_LABEL = "17.09.2026";
