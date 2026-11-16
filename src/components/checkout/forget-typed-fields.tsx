"use client";

import { useEffect } from "react";

/**
 * Forgets the contact and delivery details the checkout kept in this tab.
 *
 * The checkout keeps what was typed in sessionStorage so that a trip to
 * Google or Apple and back does not empty the form (see checkout-form.tsx).
 * Once an order exists there is nothing left to restore, and on a shared
 * phone the next shopper in the same tab should not be handed the previous
 * one's name and address. Rendered on the confirmation page; renders nothing.
 */
export function ForgetTypedCheckoutFields() {
  useEffect(() => {
    try {
      sessionStorage.removeItem("bt_checkout_typed");
    } catch {
      /* no storage: nothing was kept */
    }
  }, []);
  return null;
}
