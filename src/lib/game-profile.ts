/**
 * The character a shopper made in the 3D mall at play.buytoday.co.il — what
 * it is allowed to look like, and the one function that decides it.
 *
 * The game is a static site on another origin. It has no database and no
 * accounts of its own; a signed-in visitor's character is kept here, against
 * their BuyToday account, so that the same figure turns up on their phone and
 * on their laptop. /api/game/profile is the only door in or out, and
 * everything that door accepts has come through parseGameProfile first.
 *
 * STRICT ON PURPOSE, AND THE REASONS ARE NOT STYLE.
 *
 *   The body is written by a page this repo does not build. Whatever it
 *   sends is stored in a JSON column and handed back to every device the
 *   customer signs in on, so anything let through here is something the
 *   shop has agreed to keep and replay. A permissive "store whatever arrived"
 *   turns a customer's account row into free storage for any script that can
 *   hold a session cookie.
 *
 *   So the result is REBUILT, key by key, rather than the input being
 *   checked and then saved. An extra key the game adds tomorrow (a hat, a
 *   pet) is dropped silently instead of being stored unvalidated; it becomes
 *   real the day it is added to this file, with a rule of its own. A missing
 *   or malformed key is a 400, because half a character is not a character.
 *
 *   The name is the one free-text field, and it is the one most likely to be
 *   shown to somebody other than its author. Letters (any script — most of
 *   the people typing it write Hebrew), digits, space, dot, underscore and
 *   hyphen, twelve at most after trimming. No markup, no control characters,
 *   no right-to-left override tricks: none of those are in the allowed set,
 *   so there is nothing to escape later because nothing dangerous got in.
 *
 * No imports and no "server-only": scripts/check-game-profile.ts runs every
 * case in this file in a plain node process with no database, which is the
 * only kind of check that runs from the containers agents work in.
 */

/**
 * The game's address, and the only foreign origin any /api/game route
 * answers. Exact, scheme included: not a suffix match on buytoday.co.il, not
 * a list, and not localhost — a development copy of the game talks to a
 * development copy of the shop. Widening this is widening who can read a
 * signed-in customer's first name with their own cookie.
 */
export const GAME_ORIGIN = "https://play.buytoday.co.il";

export type GameProfile = {
  name: string;
  girl: boolean;
  skin: number;
  hair: number;
  shirt: number;
  pants: number;
  bottom: "pants" | "skirt";
  extra: "none" | "cap" | "glasses";
};

/** The largest body /api/game/profile will read. A real one is ~150 bytes. */
export const GAME_PROFILE_MAX_BYTES = 2048;

/** Counted in characters as a person sees them, not UTF-16 units. */
export const GAME_NAME_MAX = 12;

/* \p{L} is any letter in any script, \p{N} any digit — Hebrew and Arabic
   names pass, and so do the Latin ones. Anchored at both ends and applied to
   the whole trimmed string, so a single character outside the set fails it. */
const NAME_PATTERN = /^[\p{L}\p{N} ._-]*$/u;

const BOTTOMS = ["pants", "skirt"] as const;
const EXTRAS = ["none", "cap", "glasses"] as const;

/** The colour fields: 24-bit RGB packed into an integer, as three.js keeps it. */
const COLOUR_KEYS = ["skin", "hair", "shirt", "pants"] as const;

function isColour(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffff;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The profile, rebuilt from exactly the keys it may have, or null if any of
 * them is missing or wrong. Extra keys are not an error; they are dropped.
 */
export function parseGameProfile(input: unknown): GameProfile | null {
  if (!isPlainObject(input)) return null;

  const { name, girl, bottom, extra } = input;

  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if ([...trimmed].length > GAME_NAME_MAX || !NAME_PATTERN.test(trimmed)) return null;

  if (typeof girl !== "boolean") return null;

  for (const key of COLOUR_KEYS) {
    if (!isColour(input[key])) return null;
  }

  if (typeof bottom !== "string" || !(BOTTOMS as readonly string[]).includes(bottom)) return null;
  if (typeof extra !== "string" || !(EXTRAS as readonly string[]).includes(extra)) return null;

  return {
    name: trimmed,
    girl,
    skin: input.skin as number,
    hair: input.hair as number,
    shirt: input.shirt as number,
    pants: input.pants as number,
    bottom: bottom as GameProfile["bottom"],
    extra: extra as GameProfile["extra"],
  };
}

/**
 * What the game may call the customer: the first word of the name on their
 * account, or null.
 *
 * Never the email, and never something that is secretly the email. Google
 * and Apple sign-ups that arrive without a name are stored with the local
 * part of the address as a placeholder (see the Apple callback's
 * isPlaceholderName) — "dana.levi84" is an email handle, not a first name,
 * and greeting somebody by it inside a game publishes half of their address
 * on a screen other people may be looking at. So a placeholder, or anything
 * with an @ in it, is reported as no name at all and the game falls back to
 * whatever it shows a guest.
 */
export function gameFirstName(name: string | null | undefined, email: string): string | null {
  const full = (name ?? "").trim();
  if (!full || full.includes("@")) return null;
  if (full.toLowerCase() === email.split("@")[0].toLowerCase()) return null;
  const first = full.split(/\s+/)[0];
  return first || null;
}
