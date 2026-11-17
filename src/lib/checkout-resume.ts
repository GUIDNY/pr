"use client";

import { useSyncExternalStore } from "react";

/* The checkout keeps what the shopper typed (contact and delivery fields only,
   never card fields) in sessionStorage under this key, for two hours, so a
   detour does not cost them the form — see checkout-form.tsx. The key is
   written as soon as the checkout form has mounted, so its presence also says
   "the checkout was opened in this tab". */
export const TYPED_FIELDS_KEY = "bt_checkout_typed";
export const TYPED_FIELDS_TTL_MS = 2 * 60 * 60 * 1000;

export type CheckoutResume = "none" | "opened" | "saved";

function read(): CheckoutResume {
  try {
    const raw = sessionStorage.getItem(TYPED_FIELDS_KEY);
    if (!raw) return "none";
    const saved = JSON.parse(raw) as { at?: number; fields?: Record<string, unknown> };
    if (typeof saved.at !== "number" || Date.now() - saved.at >= TYPED_FIELDS_TTL_MS) return "none";
    const typed = Object.entries(saved.fields ?? {}).some(
      ([k, v]) => k !== "deliveryMethod" && typeof v === "string" && v.trim() !== "",
    );
    return typed ? "saved" : "opened";
  } catch {
    return "none";
  }
}

const noSubscribe = () => () => {};

/**
 * Whether this tab has already been to the checkout. The 17 November
 * abandoned cart (7,700 ₪) went from the checkout to the shelf to add a
 * dishwasher, opened the cart twice, and never went back — the cart's button
 * still read "המשך לתשלום" as if nothing had been started. The cart and the
 * drawer use this to say "חזרה לקופה" and, when the shopper had typed
 * something, that it is still there.
 */
export function useCheckoutResume(): CheckoutResume {
  return useSyncExternalStore(noSubscribe, read, () => "none");
}

export function checkoutCtaLabel(state: CheckoutResume): { label: string; note: string | null } {
  if (state === "saved") return { label: "חזרה לקופה", note: "הפרטים שמילאת נשמרו" };
  if (state === "opened") return { label: "חזרה לקופה", note: null };
  return { label: "המשך לתשלום", note: null };
}
