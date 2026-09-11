"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useFavoriteCount } from "@/components/layout/session-summary-provider";

/**
 * The saved-products link in the header.
 *
 * Two things it was missing, both of which the cart beside it already had.
 *
 * A count. The cart tells you it holds three things; the heart looked
 * identical whether the list was empty or held a dozen fridges somebody had
 * spent an evening comparing. A saved list nobody is reminded of is a saved
 * list nobody returns to, which is most of the point of having one.
 *
 * And a presence on a phone. It was `hidden sm:flex`, so on the device most
 * of this shop's visitors use, there was no way into favourites from the
 * header at all — only from the account section's own sidebar, which you
 * have to already be in. Saving a product is something people do while
 * browsing on a phone; getting back to what they saved should not need a
 * different device.
 *
 * The badge appears only when there is something to report, so an anonymous
 * visitor — who cannot have saved anything — sees the same plain heart as
 * before, and clicking it lands them on the login page the account layout
 * redirects to.
 */
export function FavoritesLink() {
  const count = useFavoriteCount();

  return (
    <Link
      href="/account/favorites"
      aria-label={count > 0 ? `מועדפים — ${count} מוצרים` : "מועדפים"}
      className="hover:bg-muted relative flex size-11 items-center justify-center rounded-full transition-colors sm:size-10"
    >
      <Heart className="size-5" />
      {count > 0 && (
        <span className="bg-brand text-brand-foreground absolute -top-0.5 -end-0.5 flex size-4.5 items-center justify-center rounded-full text-[10px] font-bold tabular-nums">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
