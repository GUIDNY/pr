"use server";

import { db } from "@/lib/db";

export async function getProductsForCompareAction(ids: string[]) {
  if (ids.length === 0) return [];
  const products = await db.product.findMany({
    where: { id: { in: ids } },
    include: {
      brand: true,
      category: { include: { parent: true } },
      attributeValues: { include: { attribute: true }, orderBy: { attribute: { sortOrder: "asc" } } },
    },
  });
  // preserve the order the user added them in
  return ids.map((id) => products.find((p) => p.id === id)).filter((p): p is (typeof products)[number] => Boolean(p));
}
