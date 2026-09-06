"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { getFavoriteProductIdsAction } from "@/actions/favorites";
import { DISPLAY_NAME_COOKIE } from "@/lib/auth-cookie-name";

// Which products this visitor has hearted, learned in the browser.
//
// The pages used to be handed this list by the server, and that read of the
// session is the other half of what made them uncacheable: a page that knows
// who is looking cannot be prepared before anyone looks. Moving it here lets
// the HTML be identical for everyone and the hearts fill themselves in.
//
// An anonymous visitor — which is nearly all traffic, and every crawler —
// makes no request at all: with no name cookie there is no account, so there
// is nothing to ask about. Only a signed-in visitor spends the one call, and
// spends it once for the whole page rather than once per product card.
const FavoritesContext = createContext<Set<string> | null>(null);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!document.cookie.includes(`${DISPLAY_NAME_COOKIE}=`)) return;
    let cancelled = false;
    getFavoriteProductIdsAction()
      .then((list) => {
        if (!cancelled) setIds(new Set(list));
      })
      .catch(() => {
        // The hearts stay empty. Nothing about the page depends on this, and
        // clicking one still works — the action re-checks server-side.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <FavoritesContext.Provider value={ids}>{children}</FavoritesContext.Provider>;
}

/** True once the visitor's list has arrived and contains this product. */
export function useIsFavorite(productId: string): boolean {
  const ids = useContext(FavoritesContext);
  return ids?.has(productId) ?? false;
}
