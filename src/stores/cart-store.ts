import { create } from "zustand";
import type { CartSummary } from "@/lib/cart-summary";

const EMPTY_CART: CartSummary = {
  id: "",
  items: [],
  itemCount: 0,
  subtotal: 0,
  discount: 0,
  deliveryFee: 0,
  total: 0,
  couponCode: null,
  couponError: null,
};

type CartState = {
  cart: CartSummary;
  isDrawerOpen: boolean;
  isPending: boolean;
  hydrate: (cart: CartSummary) => void;
  setCart: (cart: CartSummary) => void;
  setPending: (pending: boolean) => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
};

export const useCartStore = create<CartState>((set) => ({
  cart: EMPTY_CART,
  isDrawerOpen: false,
  isPending: false,
  hydrate: (cart) => set({ cart }),
  setCart: (cart) => set({ cart }),
  setPending: (isPending) => set({ isPending }),
  openDrawer: () => set({ isDrawerOpen: true }),
  closeDrawer: () => set({ isDrawerOpen: false }),
  toggleDrawer: () => set((s) => ({ isDrawerOpen: !s.isDrawerOpen })),
}));
