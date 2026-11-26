import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { checkInstagramAccount, describePlan, publishToInstagram } from "@/lib/instagram-publish";
import { jerusalemNow, planTodayPost, type ProductFacts } from "@/lib/instagram-plan";

/**
 * Daily 19:00 (Asia/Jerusalem) Instagram post. vercel.json fires at 16:00 and
 * 17:00 UTC so one of the two lands on 19:00 in both summer and winter time;
 * the other is a no-op. Decision logic: lib/instagram-plan.ts (pure, tested).
 *
 * ?dryRun=1 never calls Graph and never writes: it returns the post that would
 * go out (?date=YYYY-MM-DD, ?includeUnapproved=1 to preview a rejected one).
 * ?check=1 only asks Graph for username,media_count,followers_count (token test).
 * Publishing requires Bearer CRON_SECRET; check/dryRun also accept an admin session.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function load(date: string, includeUnapproved: boolean) {
  const rows = await db.instagramPost.findMany({
    where: { scheduledFor: { gte: new Date(`${date}T00:00:00Z`), lt: new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400_000) }, status: "queued", type: { not: "STORY_SET" } },
  });
  const posts = includeUnapproved ? rows.map((r) => ({ ...r, rejected: false })) : rows;
  const slugs = [...new Set(posts.map((p) => p.productSlug).filter((s): s is string => !!s))];
  const products: Record<string, ProductFacts> = {};
  if (slugs.length) {
    const found = await db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, price: true, stockQty: true, isPublished: true } });
    for (const p of found) products[p.slug] = p;
  }
  return { posts, products, rawRejected: Object.fromEntries(rows.map((r) => [r.id, r.rejected])) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const readOnly = url.searchParams.get("check") === "1" || url.searchParams.get("dryRun") === "1";
  const secret = process.env.CRON_SECRET;
  if (!(secret && request.headers.get("authorization") === `Bearer ${secret}`)) {
    // Real publishing is the cron's alone. The two read-only modes also accept
    // an admin session, same gate as /admin.
    const session = readOnly ? await getSession() : null;
    if (!session || !canManageCatalog(session.role))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (url.searchParams.get("check") === "1") {
    try { return NextResponse.json({ ok: true, check: await checkInstagramAccount() }); }
    catch (e) { return NextResponse.json({ ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 500) }, { status: 502 }); }
  }
  const dryRun = url.searchParams.get("dryRun") === "1";
  const nowD = new Date();
  const now = jerusalemNow(nowD);
  const date = (dryRun && url.searchParams.get("date")) || now.date;

  // At most one feed post a day: the catch-up window must not add a second one.
  if (!dryRun) {
    const recent = await db.instagramPost.findMany({
      where: { status: "published", type: { not: "STORY_SET" }, publishedAt: { gte: new Date(nowD.getTime() - 48 * 3600_000) } },
      select: { publishedAt: true },
    });
    if (recent.some((r) => r.publishedAt && jerusalemNow(r.publishedAt).date === now.date))
      return NextResponse.json({ ok: true, published: null, reason: "already published today", now });
  }

  const { posts, products, rawRejected } = await load(date, dryRun && url.searchParams.get("includeUnapproved") === "1");
  const plan = planTodayPost(nowD, posts, products, { ignoreHour: dryRun, date });

  if (dryRun) {
    if (plan.action === "wait" || plan.action === "none") return NextResponse.json({ dryRun: true, now, date, plan });
    const { post } = plan;
    return NextResponse.json({
      dryRun: true, now, date, action: plan.action,
      reason: plan.action === "skip" ? plan.reason : null,
      rejectedInDb: rawRejected[post.id],
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
