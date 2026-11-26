// npm run check:instagram-stories — fixtures for planTodayStories (no DB, no network).
import type { InstagramPostRow } from "../src/lib/instagram-plan";
import { planTodayStories, parseStoryProducts } from "../src/lib/instagram-stories";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}
const caption = JSON.stringify({ products: [{ slug: "a", price: 100 }, { slug: "b", price: 200 }, { slug: "c", price: 300 }] });
const set = (o: Partial<InstagramPostRow> = {}): InstagramPostRow => ({
  id: "s1", scheduledFor: new Date("2026-11-24T00:00:00Z"), type: "STORY_SET", mediaUrls: ["1", "2", "3", "4"], caption,
  productSlug: null, expectedPrice: null, approved: true, rejected: false, status: "queued", createdAt: new Date("2026-11-23T00:00:00Z"), ...o,
});
const ok = { a: { price: 100, stockQty: 5, isPublished: true }, b: { price: 200, stockQty: 5, isPublished: true }, c: { price: 300, stockQty: 5, isPublished: true } };
// 24.11.2026 10:00 IST (winter, UTC+2) = 08:00 UTC; 07:00 UTC is 09:00 (no-op run)
const ten = new Date("2026-11-24T08:00:00Z");

is("10:00 publishes", planTodayStories(ten, [set()], ok).action, "publish");
is("09:00 waits", planTodayStories(new Date("2026-11-24T07:00:00Z"), [set()], ok).action, "wait");
is("12:00 still publishes (catch-up)", planTodayStories(new Date("2026-11-24T10:00:00Z"), [set()], ok).action, "publish");
is("14:00 waits", planTodayStories(new Date("2026-11-24T12:00:00Z"), [set()], ok).action, "wait");
is("held (rejected) set does not go", planTodayStories(ten, [set({ rejected: true })], ok).action, "none");
is("already published does not go", planTodayStories(ten, [set({ status: "published" })], ok).action, "none");
is("other day does not go", planTodayStories(ten, [set({ scheduledFor: new Date("2026-11-25T00:00:00Z") })], ok).action, "none");
is("regular post is ignored", planTodayStories(ten, [set({ type: "IMAGE" })], ok).action, "none");
is("price change on one product skips", (planTodayStories(ten, [set()], { ...ok, b: { ...ok.b, price: 210 } }) as { reason: string }).reason, "b: price changed: site 210, expected 200");
is("out of stock skips", planTodayStories(ten, [set()], { ...ok, c: { ...ok.c, stockQty: 0 } }).action, "skip");
is("missing product skips", planTodayStories(ten, [set()], { a: ok.a, b: ok.b }).action, "skip");
is("unpublished product skips", planTodayStories(ten, [set()], { ...ok, a: { ...ok.a, isPublished: false } }).action, "skip");
is("bad caption skips", planTodayStories(ten, [set({ caption: "hello" })], ok).action, "skip");
is("one frame skips", planTodayStories(ten, [set({ mediaUrls: ["1"] })], ok).action, "skip");
is("dry run ignores hour", planTodayStories(new Date("2026-11-24T03:00:00Z"), [set()], ok, { ignoreHour: true }).action, "publish");
is("parse ok", parseStoryProducts(caption)?.length, 3);
is("parse rejects junk", parseStoryProducts('{"products":[{"slug":1}]}'), null);
process.exit(failures ? 1 : 0);
