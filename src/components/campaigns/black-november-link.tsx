"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { trackVisit } from "@/lib/pageview/track";

/**
 * A link into /black-november that writes one line to the visit log when it
 * is pressed (bn_link_click, `from` = where it sat).
 *
 * Why an event and not a utm on the address: a utm on an internal link
 * replaces the visitor's real source (the ad, the search) with our own page.
 * The log already knows which session pressed it; the entry on the campaign
 * page then reads as "from our bar" or "from the home shelf" by joining on
 * the session.
 */
export function BlackNovemberLink({ from, onClick, ...props }: ComponentProps<typeof Link> & { from: string }) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        trackVisit("bn_link_click", { from });
        onClick?.(e);
      }}
    />
  );
}
