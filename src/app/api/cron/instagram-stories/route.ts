import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { publishStoryFrames } from "@/lib/instagram-publish";
import { jerusalemNow, type ProductFacts } from "@/lib/instagram-plan";
import { inStoryWindow, parseStoryProducts, planTodayStories } from "@/lib/instagram-stories";

/**
 * Daily 10:00-13:59 window (Asia/Jerusalem) Instagram story set ("3 הדילים של אלפרד להיום").
 * vercel.json fires at 07:00 and 08:00 UTC so one of the two lands on 10:00 in
 * both summer and winter time; the other is a no-op. Logic: lib/instagram-stories.ts.
 *
 * Approval gate: a row goes out only when rejected = false. New rows are created
 * with rejected = true and released by the owner's say-so.
 *
 * ?dryRun=1 never calls Graph and never writes (?date=YYYY-MM-DD,
 * ?includeUnapproved=1 to preview a held set). Publishing requires Bearer
 * CRON_SECRET; dryRun also accepts an admin session.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Bearer check without a timing side channel; a wrong length is a wrong secret. */
function bearerMatches(header: string | null, secret: string): boolean {
  const a = Buffer.from(header ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function load(date: string, includeUnapproved: boolean) {
  const rows = await db.instagramPost.findMany({
    where: { scheduledFor: new Date(`${date}T00:00:00Z`), status: "queued", type: "STORY_SET" },
  });
  const posts = includeUnapproved ? rows.map((r) => ({ ...r, rejected: false })) : rows;
  const slugs = [...new Set(posts.flatMap((p) => (parseStoryProducts(p.caption) ?? []).map((r) => r.slug)))];
  const products: Record<string, ProductFacts> = {};
  if (slugs.length) {
    const found = await db.product.findMany({ where: { slug: { in: slugs } }, select: { slug: true, price: true, stockQty: true, isPublished: true } });
    for (const p of found) products[p.slug] = p;
  }
  return { posts, products, rawRejected: Object.fromEntries(rows.map((r) => [r.id, r.rejected])) };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const secret = process.env.CRON_SECRET;
  if (!(secret && bearerMatches(request.headers.get("authorization"), secret))) {
    const session = dryRun ? await getSession() : null;
    if (!session || !canManageCatalog(session.role))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const nowD = new Date();
  const now = jerusalemNow(nowD);
  const date = (dryRun && url.searchParams.get("date")) || now.date;
  if (!dryRun && !inStoryWindow(now.hour)) return NextResponse.json({ ok: true, skipped: "outside 10:00-13:59 in Asia/Jerusalem", now });

  // One story set a day: the catch-up window must not add a second one.
  if (!dryRun) {
    const recent = await db.instagramPost.findMany({
      where: { status: "published", type: "STORY_SET", publishedAt: { gte: new Date(nowD.getTime() - 48 * 3600_000) } },
      select: { publishedAt: true },
    });
    if (recent.some((r) => r.publishedAt && jerusalemNow(r.publishedAt).date === now.date))
      return NextResponse.json({ ok: true, published: null, reason: "already published today", now });
  }

  const { posts, products, rawRejected } = await load(date, dryRun && url.searchParams.get("includeUnapproved") === "1");
  const plan = planTodayStories(nowD, posts, products, { ignoreHour: dryRun, date });

  if (dryRun) {
    if (plan.action === "wait" || plan.action === "none") return NextResponse.json({ dryRun: true, now, date, plan });
    const { post } = plan;
    return NextResponse.json({
      dryRun: true, now, date, action: plan.action,
      reason: plan.action === "skip" ? plan.reason : null,
      rejectedInDb: rawRejected[post.id],
      post: { id: post.id, frames: post.mediaUrls, products: parseStoryProducts(post.caption) },
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
    const ids = await publishStoryFrames(post.mediaUrls);
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "published", igMediaId: ids.join(","), publishedAt: new Date(), error: null } });
    return NextResponse.json({ ok: true, published: post.id, igMediaIds: ids });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "failed", error: msg } });
    return NextResponse.json({ ok: false, failed: post.id, error: msg }, { status: 500 });
  }
}
