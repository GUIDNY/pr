/**
 * The date on the extension's privacy policy, in the two shapes that need it.
 *
 * Its own date, and that is the point of the file. /privacy is dated in the
 * sitemap with RETURNS_POLICY_UPDATED — another document's timestamp — so a
 * revision to it tells a crawler nothing has changed. The terms were moved
 * off that shared date for exactly this reason (see content/terms.ts), and
 * the last page that should inherit somebody else's is the one the Chrome
 * Web Store re-reads on every review.
 *
 * Both constants are the same day: the Hebrew label the page prints, and the
 * Date the sitemap sends. `npm run check:extension-privacy` asserts they
 * still agree, because nothing else would notice if one moved.
 */
export const EXTENSION_PRIVACY_UPDATED_AT = "23 באוקטובר 2026";

export const EXTENSION_PRIVACY_UPDATED = new Date("2026-10-23T00:00:00Z");
