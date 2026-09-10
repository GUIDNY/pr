"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useCartStore } from "@/stores/cart-store";
import type { CartSummary } from "@/lib/cart-summary";

type SessionSummary = {
  name: string | null;
  favoriteIds: string[];
  cart: CartSummary;
  backOffice: string | null;
};

type Loaded = { name: string | null; favoriteIds: Set<string>; backOffice: string | null };

const SessionSummaryContext = createContext<Loaded | null>(null);

/**
 * The one place the browser asks who is looking.
 *
 * Every page on this site is now built without knowing its visitor — that is
 * what let them be cached at the edge instead of rendered in Sydney on every
 * request. Three things still depend on the visitor: the name in the header,
 * which hearts are filled, and the cart badge. All three arrive here, in a
 * single call to /api/session-summary, after the page is already on screen.
 *
 * One call and not three on purpose. Each of these was its own round trip at
 * one point, and each round trip is a full crossing to the function region
 * for an answer the same session cookie already contains.
 *
 * Nothing about correctness rests on this. The cart lives on the server and
 * every action re-reads it there; a favourite toggle re-checks server-side;
 * an unanswered call leaves a header with no name, empty hearts and an empty
 * badge, all of which the page is designed to look right with.
 */
export function SessionSummaryProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const hydrateCart = useCartStore((s) => s.hydrate);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;

    let cancelled = false;
    fetch("/api/session-summary", { credentials: "same-origin" })
      .then((r) => (r.ok ? (r.json() as Promise<SessionSummary>) : null))
      .then((summary) => {
        if (!summary || cancelled) return;
        setLoaded({
          name: summary.name,
          favoriteIds: new Set(summary.favoriteIds),
          backOffice: summary.backOffice ?? null,
        });
        if (summary.cart) hydrateCart(summary.cart);
      })
      .catch(() => {
        // Anonymous is the honest default when the answer never arrives.
      });

    return () => {
      cancelled = true;
    };
  }, [hydrateCart]);

  return <SessionSummaryContext.Provider value={loaded}>{children}</SessionSummaryContext.Provider>;
}

/** The signed-in visitor's name, or null until (or unless) one is known. */
export function useAccountName(): string | null {
  return useContext(SessionSummaryContext)?.name ?? null;
}

/** True once the visitor's list has arrived and contains this product. */
export function useIsFavorite(productId: string): boolean {
  return useContext(SessionSummaryContext)?.favoriteIds.has(productId) ?? false;
}

/** How many products this visitor has saved. Zero until the list arrives. */
export function useFavoriteCount(): number {
  return useContext(SessionSummaryContext)?.favoriteIds.size ?? 0;
}

/** The path to this visitor's back office, or null if they have none. */
export function useBackOfficeHome(): string | null {
  return useContext(SessionSummaryContext)?.backOffice ?? null;
}
