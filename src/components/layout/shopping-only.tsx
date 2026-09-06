"use client";

import { usePathname } from "next/navigation";

/**
 * Hides the browsing furniture on the payment step.
 *
 * The cart drawer, the compare tray and the chat widget all exist to keep
 * somebody shopping. On the screen where they are typing a card number that is
 * exactly the wrong offer — and the chat bubble in particular sits over the
 * bottom-right corner of the payment form on a phone, which is where the pay
 * button is.
 *
 * The accessibility widget and the cookie notice are deliberately NOT in here.
 * One is required on every page of the site, and the other cannot be honest
 * about consent if it disappears on the page where a payment is made.
 */
const HIDDEN_ON = ["/checkout/pay", "/checkout/frame-return"];

/* The checkout itself is on the list now that the gateway's form appears in
   step 3 rather than on a page of its own: the chat bubble is fixed to the
   bottom-right of the viewport, which on a phone is exactly where that form's
   pay button ends up.

   Matched exactly rather than by prefix, so the confirmation and error pages
   below it keep their chat — somebody whose card was declined is the one
   customer most likely to want it. */
const HIDDEN_EXACTLY = ["/checkout"];

export function ShoppingOnly({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname && HIDDEN_EXACTLY.includes(pathname)) return null;
  if (HIDDEN_ON.some((path) => pathname?.startsWith(path))) return null;
  return <>{children}</>;
}
