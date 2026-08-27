import { CATEGORY_TREE } from "@/lib/category-tree";

// Icon choice is a pure presentation decision, kept in this static map
// (derived from the original department list) even though which
// departments actually *appear* in nav is now fully DB-driven — see
// src/lib/queries/categories.ts. A department not in this map (e.g. a
// brand-new one from a future import) just falls back to a generic icon
// rather than breaking anything.
export const DEPARTMENT_ICON_MAP: Record<string, string> = Object.fromEntries(
  CATEGORY_TREE.map((dept) => [dept.slug, dept.icon])
);
