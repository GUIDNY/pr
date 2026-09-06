/**
 * How a public URL slug is derived from Hebrew catalog text.
 *
 * Two paths create products — the Excel sync and the integrations endpoint —
 * and both need the same answer, so the rule lives here rather than in a copy
 * each. (A copy that drifted is what this repo has been bitten by before; see
 * brand-resolver.ts for the same story about brand slugs.)
 */

/** Latin letters, digits, underscore and dashes. Everything else is dropped. */
export function asciiSlug(input: string) {
  return input
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/**
 * `candidate` as a slug base, or null if it does not survive as a real one.
 *
 * asciiSlug keeps \w only, so it returns "" for anything written in Hebrew —
 * which is most of what the source sheets say. And a candidate that survives
 * it as a stray digit group or a lone letter ("3149", "kf") is no more of an
 * address than the empty string is: it tells a customer looking at the link
 * nothing, and it tells Google nothing. Both cases have to fall through to the
 * next candidate, so both answer null.
 */
export function usableSlugBase(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  const base = asciiSlug(candidate);
  if (base.length < 3) return null;
  if (!/[a-z]{2}/.test(base)) return null;
  return base;
}
