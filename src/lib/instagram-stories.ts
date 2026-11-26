import { guardProduct, jerusalemNow, type InstagramPostRow, type ProductFacts } from "@/lib/instagram-plan";

/**
 * Daily Instagram story set ("3 הדילים של אלפרד להיום"). Pure decision logic, no I/O.
 *
 * Stored as an InstagramPost row with type = "STORY_SET":
 *   mediaUrls = the 4 frame URLs in publishing order,
 *   caption   = JSON {"products":[{"slug":"...","price":2590}, ...]} (the products
 *               promised in frames 2-4; checked again right before publishing),
 *   rejected  = true until the owner approves (approval gate, same as posts).
 */
export const STORY_PUBLISH_HOUR = 10;
/** Catch-up window: a set missed at 10:00 may still go out until 13:59. */
export const STORY_LAST_HOUR = 13;
export const inStoryWindow = (hour: number) => hour >= STORY_PUBLISH_HOUR && hour <= STORY_LAST_HOUR;
export const STORY_TYPE = "STORY_SET";

export type StoryProductRef = { slug: string; price: number };

export function parseStoryProducts(caption: string): StoryProductRef[] | null {
  try {
    const j = JSON.parse(caption) as { products?: unknown };
    if (!Array.isArray(j.products) || j.products.length === 0) return null;
    const out: StoryProductRef[] = [];
    for (const p of j.products) {
      const o = p as { slug?: unknown; price?: unknown };
      if (typeof o.slug !== "string" || typeof o.price !== "number") return null;
      out.push({ slug: o.slug, price: o.price });
    }
    return out;
  } catch {
    return null;
  }
}

/** Skip reason (first failing product), or null when every product is still as promised. */
export function guardStoryProducts(refs: StoryProductRef[], products: Record<string, ProductFacts>): string | null {
  for (const r of refs) {
    const reason = guardProduct({ productSlug: r.slug, expectedPrice: r.price }, products[r.slug]);
    if (reason) return `${r.slug}: ${reason}`;
  }
  return null;
}

export type StoryPlan =
  | { action: "wait"; reason: string; now: ReturnType<typeof jerusalemNow> }
  | { action: "none"; reason: string }
  | { action: "publish"; post: InstagramPostRow; refs: StoryProductRef[] }
  | { action: "skip"; post: InstagramPostRow; reason: string };

export function planTodayStories(
  now: Date,
  posts: InstagramPostRow[],
  products: Record<string, ProductFacts>,
  opts: { ignoreHour?: boolean; date?: string } = {},
): StoryPlan {
  const j = jerusalemNow(now);
  if (!opts.ignoreHour && !inStoryWindow(j.hour))
    return { action: "wait", reason: "outside 10:00-13:59 in Asia/Jerusalem", now: j };
  const date = opts.date ?? j.date;
  const post = posts
    .filter((p) => p.type === STORY_TYPE && p.scheduledFor.toISOString().slice(0, 10) === date && !p.rejected && p.status === "queued")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (!post) return { action: "none", reason: `no queued, non-rejected story set for ${date}` };
  if (post.mediaUrls.length < 2) return { action: "skip", post, reason: "story set has fewer than 2 frames" };
  const refs = parseStoryProducts(post.caption);
  if (!refs) return { action: "skip", post, reason: "caption is not a valid products JSON" };
  const reason = guardStoryProducts(refs, products);
  return reason ? { action: "skip", post, reason } : { action: "publish", post, refs };
}
