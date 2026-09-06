"use client";

import { useAccountName } from "@/components/layout/session-summary-provider";

/**
 * The signed-in visitor's first name, in a slot whose width never changes.
 *
 * The header cannot know who is looking — that is what makes every page in
 * the shop cacheable — so this starts empty and fills in once
 * /api/session-summary answers. Two deliberate choices keep that from being
 * visible as a flicker:
 *
 * - It never says "התחברות" first. Replacing one word with another is what
 *   would flicker; going from a plain account icon to an icon with a name
 *   beside it does not read as a correction, because nothing was corrected.
 * - The slot holds its width whether or not it has text in it, so the icons
 *   either side of it never move. Reserved space is the whole reason there
 *   is no layout shift to measure.
 *
 * Anonymous visitors — nearly all traffic — simply keep the icon, which is
 * what a person expects an account button to look like anyway.
 */
export function AccountLabel() {
  const name = useAccountName();
  const first = name?.trim().split(" ")[0] ?? "";

  return (
    <span
      aria-hidden={!first}
      className="inline-block w-[4.5rem] truncate text-start align-middle text-sm font-medium"
    >
      {first}
    </span>
  );
}
