import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { TEST_PRODUCT_SKUS } from "@/lib/test-products";

/**
 * Which products every outbound product feed carries: exactly what the site
 * sells (PUBLIC_PRODUCT_WHERE), minus the SKUs that exist only so somebody can
 * put a real card through the gateway (lib/test-products.ts).
 *
 * One definition shared by the Google Merchant feed and the ChatGPT feed, so
 * "what is in a feed" cannot drift from "what is on the site" in one of them
 * and not the other.
 */
export const FEED_PRODUCT_WHERE = {
  ...PUBLIC_PRODUCT_WHERE,
  sku: { notIn: [...TEST_PRODUCT_SKUS] },
};
