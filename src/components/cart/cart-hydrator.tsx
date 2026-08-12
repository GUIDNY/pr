"use client";

import { useEffect, useRef } from "react";
import { useCartStore } from "@/stores/cart-store";
import type { CartSummary } from "@/lib/cart-summary";

export function CartHydrator({ initialCart }: { initialCart: CartSummary }) {
  const hydrate = useCartStore((s) => s.hydrate);
  const hasHydrated = useRef(false);

  useEffect(() => {
    if (hasHydrated.current) return;
    hasHydrated.current = true;
    hydrate(initialCart);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
