"use client";

import { useSyncExternalStore } from "react";

/* The checkout keeps what the shopper typed (contact and delivery fields only,
   never card fields) in sessionStorage under this key, for two hours, so a
   detour does not cost them the form — see checkout-form.tsx. The key is
   written as soon as the checkout form has mounted, so its presence also says
   "the checkout was opened in this tab". */
export const TYPED_FIELDS_KEY = "bt_checkout_typed";
export const TYPED_FIELDS_TTL_MS = 2 * 60 * 60 * 1000;

/* Set when the checkout mounts (next to its checkout_start event): the typed
   key is only written once something changes in the form, so on its own it
   misses a shopper who opened the checkout, typed nothing and left. */
export const CHECKOUT_OPENED_KEY = "bt_checkout_opened";

export function markCheckoutOpened() {
  try {
    sessionStorage.setItem(CHECKOUT_OPENED_KEY, String(Date.now()));
  } catch {
    /* storage refused: the cart keeps its usual label */
  }
}

export function clearCheckoutResume() {
  try {
    sessionStorage.removeItem(TYPED_FIELDS_KEY);
    sessionStorage.removeItem(CHECKOUT_OPENED_KEY);
  } catch {
    /* ignore */
  }
}

export type CheckoutResume = "none" | "opened" | "saved";

function read(): CheckoutResume {
  try {
    const opened = Number(sessionStorage.getItem(CHECKOUT_OPENED_KEY) ?? 0);
    const openedRecently = opened > 0 && Date.now() - opened < TYPED_FIELDS_TTL_MS;
    const raw = sessionStorage.getItem(TYPED_FIELDS_KEY);
    if (!raw) return openedRecently ? "opened" : "none";
    const saved = JSON.parse(raw) as { at?: number; fields?: Record<string, unknown> };
    if (typeof saved.at !== "number" || Date.now() - saved.at >= TYPED_FIELDS_TTL_MS) {
      return openedRecently ? "opened" : "none";
    }
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
