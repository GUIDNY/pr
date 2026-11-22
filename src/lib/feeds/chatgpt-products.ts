import { SITE_URL } from "@/lib/site-url";
import { BUSINESS } from "@/lib/business";
import { computeDeliveryFee } from "@/lib/delivery";
import { colorInTitle } from "@/lib/catalog/variant-colors";
import type { StockStatus } from "@/lib/enums";
import { AVAILABILITY, feedDescription, validGtin } from "./google-merchant";

/**
 * The product feed ChatGPT pulls from a hosted URL (Business Hub → Products →
 * "Use a hosted URL"). Format: OpenAI's "Product feed schema", stable
 * file-upload version, one JSON object per line (JSONL).
 * https://developers.openai.com/commerce/specs/file-upload/products
 *
 * Built from the same rows as the Google Merchant feed (FEED_PRODUCT_WHERE),
 * and by the same rules about what may be claimed: availability from the same
 * table, price and was-price handled the same way, the same plain-text
 * description. It is a read of the storefront and holds no secret.
 *
 * WHAT THE SCHEMA ASKS FOR THAT GOOGLE'S DOES NOT
 *
 *  - image_url is "a direct image URL, such as a JPEG or PNG". WebP is not on
 *    that list, and every photograph we host is a WebP, so the feed points at
 *    the `.jpg` twin of each one, which /img converts on request (see
 *    app/img/[...path]). Nothing in the storage changes.
 *  - Images only from this domain. A hotlink to a supplier's site is not
 *    fetched by ChatGPT's crawler and renders as a product with no picture,
 *    which is the very problem this feed was built to fix. A product whose
 *    pictures are all somebody else's is left out until its photograph has
 *    been copied here, rather than listed without one; image_url is a
 *    required field either way.
 *  - price is "amount CURRENCY", so "1790.00 ILS".
 *  - target_countries and store_country are required. The schema says a
 *    standard upload is US-only and that other markets are enabled by OpenAI
 *    per integration, so IL is what is true of this shop and what is sent;
 *    whether Business Hub honours it is OpenAI's side of the setup.
 */

const CURRENCY = "ILS";
const MAX_TITLE = 150;
const MAX_DESCRIPTION = 5000;
const MAX_ADDITIONAL_IMAGES = 10;

export const CHATGPT_FEED_PATH = "/feeds/chatgpt-products.jsonl";

/** Attribution on the product links, so a visit from ChatGPT is its own source. */
const UTM = "utm_source=chatgpt&utm_medium=shopping";

export type ChatgptFeedProduct = {
  sku: string;
  slug: string;
  title: string;
  description: string | null;
  shortDescription: string | null;
  model: string | null;
  gtin13: string | null;
  colorName: string | null;
  variantGroupId: string | null;
  price: number;
  compareAtPrice: number | null;
  stockStatus: string;
  brand: { name: string };
  category: { name: string; parent: { name: string } | null };
  images: { url: string }[];
};

function clean(value: string, max: number): string {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u2028\u2029]/g, " ")
    .trim()
    .slice(0, max);
}

function money(amount: number): string {
  return `${amount.toFixed(2)} ${CURRENCY}`;
}

const OWN_IMAGE_PREFIX = `${SITE_URL}/img/`;

/**
 * The address to hand ChatGPT for one of our photographs, or null when it is
 * not ours or not in a format it takes.
 *
 * A migrated photograph is stored as `.webp`; the `.jpg` beside it is served
 * by the same route, converted. An address that is already JPEG or PNG is
 * passed through as it is.
 */
export function chatgptImageUrl(url: string): string | null {
  if (!url.startsWith(OWN_IMAGE_PREFIX)) return null;
  if (/\.(jpe?g|png)$/i.test(url)) return url;
  if (/\/migrated\/.+\.webp$/i.test(url)) return url.replace(/\.webp$/i, ".jpg");
  return null;
}

/**
 * Which colour groups are safe to declare as variants. The schema wants every
 * member of a group to carry the same option names and a unique combination,
 * so a group is only declared when it has two or more members here, every one
 * has a colour, and no two share one. Anything looser is a group of rows the
 * importer may refuse; leaving the grouping out costs nothing.
 */
function variantGroups(products: { sku: string; color: string | null; variantGroupId: string | null }[]) {
  const byGroup = new Map<string, { sku: string; color: string | null }[]>();
  for (const p of products) {
    if (!p.variantGroupId || p.variantGroupId === p.sku) continue;
    const list = byGroup.get(p.variantGroupId) ?? [];
    list.push(p);
    byGroup.set(p.variantGroupId, list);
  }
  const ok = new Set<string>();
  for (const [group, members] of byGroup) {
    if (members.length < 2) continue;
    if (members.some((m) => !m.color)) continue;
    const colors = new Set(members.map((m) => m.color!.trim().toLowerCase()));
    if (colors.size !== members.length) continue;
    if (members.some((m) => m.sku === group)) continue;
    ok.add(group);
  }
  return ok;
}

export type ChatgptFeed = {
  body: string;
  included: number;
  /** Left out because none of its photographs is on our own domain. */
  skippedNoOwnImage: number;
  /** Left out because it has no availability this shop vouches for, or no text. */
  skippedOther: number;
};

export function renderChatgptFeed(products: ChatgptFeedProduct[]): ChatgptFeed {
  const withColor = products.map((p) => ({
    sku: p.sku,
    variantGroupId: p.variantGroupId,
    color: p.colorName ?? colorInTitle(p.title),
  }));
  const infoBySku = new Map(withColor.map((p) => [p.sku, p]));
  const colorBySku = new Map(withColor.map((p) => [p.sku, p.color]));

  // Only rows that will actually be written count towards a group.
  const candidates: typeof withColor = [];
  const prepared: { p: ChatgptFeedProduct; availability: string; images: string[]; title: string; description: string }[] = [];
  let skippedNoOwnImage = 0;
  let skippedOther = 0;

  for (const p of products) {
    const availability = AVAILABILITY[p.stockStatus as StockStatus];
    const title = clean(p.title, MAX_TITLE);
    const description = clean(feedDescription(p), MAX_DESCRIPTION);
    if (!availability || !title || !description) {
      skippedOther++;
      continue;
    }
    const images = p.images.map((i) => chatgptImageUrl(i.url)).filter((u): u is string => !!u);
    if (images.length === 0) {
      skippedNoOwnImage++;
      continue;
    }
    prepared.push({ p, availability, images, title, description });
    candidates.push(infoBySku.get(p.sku)!);
  }

  const groups = variantGroups(candidates);
  const lines: string[] = [];

  for (const { p, availability, images, title, description } of prepared) {
    const [image, ...extra] = images;
    const row: Record<string, unknown> = {
      item_id: p.sku,
      title,
      description,
      url: `${SITE_URL}/product/${p.slug}?${UTM}`,
      brand: p.brand.name,
      seller_name: BUSINESS.name,
      seller_url: SITE_URL,
      image_url: image,
    };
    if (extra.length) row.additional_image_urls = extra.slice(0, MAX_ADDITIONAL_IMAGES);

    // compareAtPrice is the was-price: it is the regular price, and the live
    // price is the sale price. Same reading as the Google feed.
    if (p.compareAtPrice && p.compareAtPrice > p.price) {
      row.price = money(p.compareAtPrice);
      row.sale_price = money(p.price);
    } else {
      row.price = money(p.price);
    }
    row.availability = availability;
    row.condition = "new";

    const gtin = validGtin(p.gtin13);
    if (gtin) row.gtin = gtin;
    if (p.model) row.mpn = clean(p.model, 70);

    const color = colorBySku.get(p.sku) ?? null;
    if (color) row.color = color;
    if (p.variantGroupId && groups.has(p.variantGroupId) && color) {
      row.group_id = p.variantGroupId;
      row.listing_has_variations = true;
      row.variant_dict = { color };
    }

    const category = [p.category.parent?.name, p.category.name].filter(Boolean).join(" > ");
    if (category) row.product_category = category;

    // Same function the cart and checkout call, so the feed cannot quote a
    // delivery charge the basket contradicts.
    row.shipping_price = money(computeDeliveryFee(p.price));

    row.target_countries = [BUSINESS.country];
    row.store_country = BUSINESS.country;

    lines.push(JSON.stringify(row));
  }

  return {
    body: lines.length ? lines.join("\n") + "\n" : "",
    included: lines.length,
    skippedNoOwnImage,
    skippedOther,
  };
}
