/**
 * Israeli phone numbers, reduced to one shape.
 *
 * People type the same number six ways — 054-770-1899, 054 770 1899,
 * +972547701899, 972-54-7701899 — and every one of them has to find the same
 * account. So both ends go through here: what gets stored on registration
 * and what somebody types into the sign-in field.
 *
 * The canonical form is the local one, 0 followed by nine digits, because
 * that is what an Israeli reads back to you over the phone and what is
 * already sitting in the column.
 */

/** The digits of `raw`, with +972 / 972 country prefixes folded to a leading 0. */
export function normalizeIsraeliPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "");
  if (!digits) return null;

  let local = digits;
  if (local.startsWith("+972")) local = `0${local.slice(4)}`;
  else if (local.startsWith("972")) local = `0${local.slice(3)}`;

  // Somebody who wrote +972 0 54… — a common double-prefix — ends up with
  // two leading zeros here.
  local = local.replace(/^0+/, "0");

  if (!/^0\d{8,9}$/.test(local)) return null;
  return local;
}

/**
 * Does this look like somebody trying to enter a phone number rather than an
 * email address?
 *
 * Deliberately crude: anything with an "@" is an email attempt and anything
 * else that is mostly digits is a phone attempt. The point is only to choose
 * which lookup to run — a wrong guess produces "not found", which is what it
 * would have produced anyway.
 */
export function looksLikePhone(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.includes("@")) return false;
  return /^[\d\s()+-]+$/.test(trimmed) && normalizeIsraeliPhone(trimmed) !== null;
}
