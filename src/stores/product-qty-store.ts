import { create } from "zustand";

// The quantity stepper lives in PurchasePanel, but the sticky mobile buy
// bar (a separate sibling component, rendered further down the page) needs
// to show the same selected quantity's total price and add the same
// quantity to the cart — not persisted (a fresh product page should always
// start at 1), reset explicitly on productId change by PurchasePanel.
type ProductQtyState = {
  qty: number;
  setQty: (qty: number) => void;
};

export const useProductQtyStore = create<ProductQtyState>((set) => ({
  qty: 1,
  setQty: (qty) => set({ qty }),
}));
