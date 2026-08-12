import { create } from "zustand";
import { persist } from "zustand/middleware";

export const MAX_COMPARE = 4;

type CompareState = {
  productIds: string[];
  toggle: (id: string) => void;
  remove: (id: string) => void;
  clear: () => void;
};

export const useCompareStore = create<CompareState>()(
  persist(
    (set) => ({
      productIds: [],
      toggle: (id) =>
        set((s) => {
          const exists = s.productIds.includes(id);
          const next = exists ? s.productIds.filter((p) => p !== id) : [...s.productIds, id].slice(0, MAX_COMPARE);
          return { productIds: next };
        }),
      remove: (id) => set((s) => ({ productIds: s.productIds.filter((p) => p !== id) })),
      clear: () => set({ productIds: [] }),
    }),
    { name: "prec-compare" }
  )
);
