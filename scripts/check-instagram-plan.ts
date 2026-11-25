// npm run check:instagram — fixtures for planTodayPost (no DB, no network).
import { planTodayPost, jerusalemNow, type InstagramPostRow } from "../src/lib/instagram-plan";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
}
const post = (o: Partial<InstagramPostRow> = {}): InstagramPostRow => ({
  id: "p1", scheduledFor: new Date("2026-11-26T00:00:00Z"), type: "IMAGE", mediaUrls: ["u"], caption: "c",
  productSlug: "tv", expectedPrice: 2500, approved: true, rejected: false, status: "queued", createdAt: new Date("2026-11-21T00:00:00Z"), ...o,
});
const prod = { tv: { price: 2500, stockQty: 1, isPublished: true } };
// 26.11.2026 19:00 IST (winter, UTC+2) = 17:00 UTC
const winter = new Date("2026-11-26T17:00:00Z");
// 15.07.2026 19:00 IDT (summer, UTC+3) = 16:00 UTC
const summer = new Date("2026-07-15T16:00:00Z");

is("winter 17:00Z is hour 19", jerusalemNow(winter), { date: "2026-11-26", hour: 19 });
is("winter 16:00Z is not 19", jerusalemNow(new Date("2026-11-26T16:00:00Z")).hour, 18);
is("summer 16:00Z is hour 19", jerusalemNow(summer), { date: "2026-07-15", hour: 19 });
is("summer 17:00Z is not 19", jerusalemNow(new Date("2026-07-15T17:00:00Z")).hour, 20);
is("approved post publishes", planTodayPost(winter, [post()], prod).action, "publish");
is("summer publishes", planTodayPost(summer, [post({ scheduledFor: new Date("2026-07-15T00:00:00Z") })], prod).action, "publish");
is("21:00 IST still publishes (catch-up window)", planTodayPost(new Date("2026-11-26T19:00:00Z"), [post()], prod).action, "publish");
is("23:00 IST waits", planTodayPost(new Date("2026-11-26T21:00:00Z"), [post()], prod).action, "wait");
is("wrong hour waits", planTodayPost(new Date("2026-11-26T16:00:00Z"), [post()], prod).action, "wait");
is("price changed skips", (planTodayPost(winter, [post()], { tv: { ...prod.tv, price: 2600 } }) as { reason: string }).reason, "price changed: site 2600, expected 2500");
is("stock 0 skips", planTodayPost(winter, [post()], { tv: { ...prod.tv, stockQty: 0 } }).action, "skip");
is("unpublished product skips", planTodayPost(winter, [post()], { tv: { ...prod.tv, isPublished: false } }).action, "skip");
is("missing product skips", planTodayPost(winter, [post()], {}).action, "skip");
is("rejected does not go", planTodayPost(winter, [post({ rejected: true })], prod).action, "none");
is("approved=false but not rejected still goes", planTodayPost(winter, [post({ approved: false })], prod).action, "publish");
is("already published does not go", planTodayPost(winter, [post({ status: "published" })], prod).action, "none");
is("other day does not go", planTodayPost(winter, [post({ scheduledFor: new Date("2026-11-27T00:00:00Z") })], prod).action, "none");
is("no product slug needs no guard", planTodayPost(winter, [post({ productSlug: null, expectedPrice: null })], {}).action, "publish");
is("dry run ignores hour", planTodayPost(new Date("2026-11-26T10:00:00Z"), [post()], prod, { ignoreHour: true }).action, "publish");
process.exit(failures ? 1 : 0);
