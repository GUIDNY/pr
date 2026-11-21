import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { describePlan, publishToInstagram } from "@/lib/instagram-publish";
import { jerusalemNow, planTodayPost, type ProductFacts } from "@/lib/instagram-plan";

/**
 * Daily 19:00 (Asia/Jerusalem) Instagram post. vercel.json fires at 16:00 and
 * 17:00 UTC so one of the two lands on 19:00 in both summer and winter time;
 * the other is a no-op. Decision logic: lib/instagram-plan.ts (pure, tested).
 *
 * ?dryRun=1 never calls Graph and never writes: it returns the post that would
 * go out (?date=YYYY-MM-DD, ?includeUnapproved=1 to preview an unapproved one).
 * Everything requires CRON_SECRET.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function load(date: string, includeUnapproved: boolean) {
  const rows = await db.instagramPost.findMany({
    where: { scheduledFor: new Date(`${date}T00:00:00Z`), status: "queued" },
  });
  const posts = includeUnapproved ? rows.map((r) => ({ ...r, approved: true })) : rows;
  const slugs = [...new Set(posts.map((p) => p.productSlug).filter((s): s is string => !!s))];
  const products: Record<string, ProductFacts> = {};
  if (slugs.length) {
    const found = await db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, price: true, stockQty: true, isPublished: true } });
    for (const p of found) products[p.slug] = p;
  }
  return { posts, products, rawApproved: Object.fromEntries(rows.map((r) => [r.id, r.approved])) };
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!(secret && request.headers.get("authorization") === `Bearer ${secret}`))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const nowD = new Date();
  const now = jerusalemNow(nowD);
  const date = (dryRun && url.searchParams.get("date")) || now.date;

  if (!dryRun && now.hour !== 19) return NextResponse.json({ ok: true, skipped: "not 19:00 in Asia/Jerusalem", now });

  const { posts, products, rawApproved } = await load(date, dryRun && url.searchParams.get("includeUnapproved") === "1");
  const plan = planTodayPost(nowD, posts, products, { ignoreHour: dryRun, date });

  if (dryRun) {
    if (plan.action === "wait" || plan.action === "none") return NextResponse.json({ dryRun: true, now, date, plan });
    const { post } = plan;
    return NextResponse.json({
      dryRun: true, now, date, action: plan.action,
      reason: plan.action === "skip" ? plan.reason : null,
      approvedInDb: rawApproved[post.id],
      post: { id: post.id, type: post.type, mediaUrls: post.mediaUrls, caption: post.caption, productSlug: post.productSlug, expectedPrice: post.expectedPrice },
      graphPlan: describePlan(post),
    });
  }

  if (plan.action === "none" || plan.action === "wait") return NextResponse.json({ ok: true, published: null, reason: plan.reason, now });
  const post = plan.post;

  // Claim it so an overlapping run cannot post twice.
  const claim = await db.instagramPost.updateMany({ where: { id: post.id, status: "queued" }, data: { status: "publishing" } });
  if (claim.count === 0) return NextResponse.json({ ok: true, published: null, reason: "already claimed" });

  if (plan.action === "skip") {
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "skipped", error: plan.reason } });
    return NextResponse.json({ ok: true, skipped: plan.reason, id: post.id });
  }
  try {
    const { igMediaId, permalink } = await publishToInstagram(post);
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "published", igMediaId, permalink, publishedAt: new Date(), error: null } });
    return NextResponse.json({ ok: true, published: post.id, igMediaId, permalink });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "failed", error: msg } });
    return NextResponse.json({ ok: false, failed: post.id, error: msg }, { status: 500 });
  }
}
