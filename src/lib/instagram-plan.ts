/** Pure decision logic for the daily Instagram post. No I/O, so it is testable. */
export const PUBLISH_HOUR = 19;
/** Catch-up window: a post missed at 19:00 (e.g. awaiting approval) may still go out until 22:59. */
export const PUBLISH_LAST_HOUR = 22;
export const inPublishWindow = (hour: number) => hour >= PUBLISH_HOUR && hour <= PUBLISH_LAST_HOUR;
const TZ = "Asia/Jerusalem";

export type InstagramPostRow = {
  id: string;
  scheduledFor: Date;
  type: string;
  mediaUrls: string[];
  caption: string;
  productSlug: string | null;
  expectedPrice: number | null;
  approved: boolean;
  rejected: boolean;
  status: string;
  createdAt: Date;
};
export type ProductFacts = { price: number; stockQty: number; isPublished: boolean };

export function jerusalemNow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: Number(g("hour")) };
}

/** Skip reason, or null when the product is still as promised. */
export function guardProduct(post: Pick<InstagramPostRow, "productSlug" | "expectedPrice">, p: ProductFacts | undefined): string | null {
  if (!post.productSlug) return null;
  if (!p) return `product ${post.productSlug} not found`;
  if (!p.isPublished) return "product is not published";
  if (!(p.stockQty > 0)) return `out of stock (stockQty=${p.stockQty})`;
  if (post.expectedPrice != null && p.price !== post.expectedPrice)
    return `price changed: site ${p.price}, expected ${post.expectedPrice}`;
  return null;
}

export type Plan =
  | { action: "wait"; reason: string; now: ReturnType<typeof jerusalemNow> }
  | { action: "none"; reason: string }
  | { action: "publish"; post: InstagramPostRow }
  | { action: "skip"; post: InstagramPostRow; reason: string };

/**
 * Which post goes out now. `ignoreHour` is for dry runs only; `date` lets a
 * dry run ask about another day. Rejected and non-queued posts never go out.
 */
export function planTodayPost(
  now: Date,
  posts: InstagramPostRow[],
  products: Record<string, ProductFacts>,
  opts: { ignoreHour?: boolean; date?: string } = {},
): Plan {
  const j = jerusalemNow(now);
  if (!opts.ignoreHour && !inPublishWindow(j.hour))
    return { action: "wait", reason: "outside 19:00-22:59 in Asia/Jerusalem", now: j };
  const date = opts.date ?? j.date;
  const post = posts
    .filter((p) => p.scheduledFor.toISOString().slice(0, 10) === date && !p.rejected && p.status === "queued")
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  if (!post) return { action: "none", reason: `no queued, non-rejected post for ${date}` };
  const reason = guardProduct(post, post.productSlug ? products[post.productSlug] : undefined);
  return reason ? { action: "skip", post, reason } : { action: "publish", post };
}
