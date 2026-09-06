"use client";

import { useEffect, useRef } from "react";
import { useCartStore } from "@/stores/cart-store";
import { getCartSummaryAction } from "@/actions/cart";

/**
 * Loads the visitor's cart into the client store, from the browser.
 *
 * This used to be handed the cart by an async Server Component in the root
 * layout, and that is what made every page on the site impossible to cache —
 * `/accessibility`, a page of static text, was rebuilt per request along with
 * everything else, because reading the cart cookie meant the server could not
 * produce any page before knowing who was asking. Googlebot, always arriving
 * to a cold server, paid 2.4 seconds for it on the homepage.
 *
 * A <Suspense> boundary around it did not help. It let the rest of the page
 * stream ahead, which is why it was there, but a route that touches cookies
 * anywhere is a dynamic route however the work is arranged.
 *
 * So the page ships identical for everyone and the cart arrives just after.
 * The badge is briefly empty for a visitor who has one — the same moment of
 * emptiness every shop with a client-rendered cart has — and in exchange the
 * page itself is served from a cache near the visitor rather than built in
 * Australia. Crawlers run no JavaScript, so this costs them nothing at all.
 *
 * Nothing about correctness rests on this: the cart lives on the server, and
 * every action that changes it re-reads it there. A failed load leaves the
 * badge empty and the next add still works on the real cart.
 */
export function CartHydrator() {
  const hydrate = useCartStore((s) => s.hydrate);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;
    getCartSummaryAction()
      .then((summary) => {
        if (summary) hydrate(summary);
      })
      .catch(() => {
        // Leave the store as it is — empty is the honest default here.
      });
  }, [hydrate]);

  return null;
}
