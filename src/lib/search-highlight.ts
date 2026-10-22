/**
 * The part of a suggestion title the reader is actually scanning for.
 *
 * A query like "מקרר" returns rows that all begin with the same word, and
 * the thing that tells them apart sits further along the line. Emboldening
 * the match adds no room, but it moves the eye past the identical opening
 * to where the difference is.
 *
 * Kept out of the component on purpose: it is string work with a regular
 * expression built from user input, which is the part worth testing, and
 * the component drags in `next/navigation` and a server action that cannot
 * be loaded from a plain script.
 */

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type TitlePart = { text: string; match: boolean };

/**
 * Split a title into the pieces that matched the query and the pieces that
 * did not. Concatenating `text` always returns the original title.
 *
 * The query is escaped before it becomes a pattern. It arrives a keystroke
 * at a time, so "מקרר (" is a state the box passes through on the way to
 * something valid, and an unescaped RegExp throws there — which in a render
 * path means the dropdown disappears rather than showing nothing useful.
 *
 * Terms of one character are dropped. A single Hebrew letter matches most
 * of a title, and marking nearly all of it marks nothing.
 */
export function splitOnMatches(title: string, query: string): TitlePart[] {
  const terms = query.trim().split(/\s+/).filter((term) => term.length >= 2);
  if (terms.length === 0) return [{ text: title, match: false }];
  const lowered = new Set(terms.map((term) => term.toLowerCase()));
  const pattern = new RegExp(`(${terms.map(escapeRegExp).join("|")})`, "gi");
  return title
    .split(pattern)
    .filter((part) => part !== "")
    .map((part) => ({ text: part, match: lowered.has(part.toLowerCase()) }));
}
