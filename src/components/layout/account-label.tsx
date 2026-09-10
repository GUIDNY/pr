"use client";

import { useAccountName } from "@/components/layout/session-summary-provider";

/**
 * The signed-in visitor's first name, when there is one.
 *
 * The header cannot know who is looking — that is what makes every page in
 * the shop cacheable — so this starts empty and fills in once
 * /api/session-summary answers.
 *
 * It used to hold a fixed 4.5rem slot open whether or not a name ever
 * arrived, to keep the icons either side from moving when one did. That
 * bought a real thing at a price paid by the wrong people: almost everyone
 * who visits a shop is not signed in, so almost everyone was looking at 72
 * pixels of nothing wedged between the account icon and the cart, with the
 * icon shoved off the centre of its own button. It read as broken, which is
 * the opposite of what reserved space is for.
 *
 * So the slot is gone. What it prevented — a small reflow when the name
 * lands — now happens only to signed-in visitors, once, in their own
 * browser, and moves the account button by the width of a first name. What
 * it caused was visible to every visitor on every page.
 *
 * The cap is wider than it was, too: 4.5rem truncated most Hebrew first
 * names, so the feature that justified the empty space did not really work
 * when it fired.
 */
export function AccountLabel() {
  const name = useAccountName();
  const first = name?.trim().split(" ")[0] ?? "";

  // Nothing rather than an empty span: the button lays its children out with
  // a gap, and a zero-width child still gets one.
  if (!first) return null;

  return (
    <span className="hidden max-w-28 truncate align-middle text-sm font-medium sm:inline-block">
      {first}
    </span>
  );
}
