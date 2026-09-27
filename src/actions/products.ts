"use server";

import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";

export async function getProductsForCompareAction(ids: string[]) {
  if (ids.length === 0) return [];
  /* Named fields rather than `include`, for the same reason as the search
     box and the product cards: an `include` is every column of Product, and
     this one crosses the network twice — once from the database, then again
     serialised to the browser, description HTML and internal notes and all,
     for a table that shows a price and a spec list. The columns below are
     exactly what compare/page.tsx reads. */
  const products = await db.product.findMany({
    where: { id: { in: ids }, ...PUBLIC_PRODUCT_WHERE },
    select: {
      id: true,
      slug: true,
      title: true,
      price: true,
      compareAtPrice: true,
      stockStatus: true,
      deliveryDays: true,
      warrantyMonths: true,
      brand: { select: { name: true } },
      category: { select: { name: true, icon: true, parent: { select: { name: true, icon: true } } } },
      attributeValues: { include: { attribute: true }, orderBy: { attribute: { sortOrder: "asc" } } },
      images: { select: { url: true }, take: 1, orderBy: { sortOrder: "asc" } },
    },
  });
  // preserve the order the user added them in
  return ids.map((id) => products.find((p) => p.id === id)).filter((p): p is (typeof products)[number] => Boolean(p));
}
