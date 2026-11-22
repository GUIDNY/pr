import { db } from "@/lib/db";
import { FEED_PRODUCT_WHERE } from "./feed-where";
import { renderChatgptFeed } from "./chatgpt-products";

/**
 * The query behind both addresses of the ChatGPT feed (.jsonl and .jsonl.gz),
 * so the two cannot disagree about what is in them. See chatgpt-products.ts for
 * the format and the rules.
 */
export async function buildChatgptFeed() {
  const products = await db.product.findMany({
    where: FEED_PRODUCT_WHERE,
    select: {
      sku: true,
      slug: true,
      title: true,
      description: true,
      shortDescription: true,
      model: true,
      gtin13: true,
      colorName: true,
      variantGroupId: true,
      price: true,
      compareAtPrice: true,
      stockStatus: true,
      brand: { select: { name: true } },
      category: { select: { name: true, parent: { select: { name: true } } } },
      images: { select: { url: true }, orderBy: { sortOrder: "asc" } },
    },
    orderBy: { sku: "asc" },
  });
  return renderChatgptFeed(products);
}
