import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { describePlan, jerusalemNow, productGuard, publishToInstagram, PUBLISH_HOUR } from "@/lib/instagram-publish";

/**
 * Daily 19:00 (Asia/Jerusalem) Instagram post. vercel.json fires at 16:00 and
 * 17:00 UTC so one of the two lands on 19:00 in both summer and winter time;
 * the other is a no-op. Only today's approved + queued post is published.
 *
 * ?dryRun=1 never calls Graph and never writes: it returns the post that would
 * go out (optionally ?date=YYYY-MM-DD, ?includeUnapproved=1) and what the
 * product guard says. Everything else requires CRON_SECRET.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!(secret && request.headers.get("authorization") === `Bearer ${secret}`))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const dryRun = url.searchParams.get("dryRun") === "1";
  const now = jerusalemNow();

  if (dryRun) {
    const date = url.searchParams.get("date") || now.date;
    const where = { scheduledFor: new Date(`${date}T00:00:00Z`), status: "queued", ...(url.searchParams.get("includeUnapproved") === "1" ? {} : { approved: true }) };
    const post = await db.instagramPost.findFirst({ where, orderBy: { createdAt: "asc" } });
    if (!post) return NextResponse.json({ dryRun: true, now, date, wouldPublish: null });
    const guard = await productGuard(post);
    return NextResponse.json({
      dryRun: true, now, date,
      approved: post.approved,
      wouldPublish: !post.approved ? false : guard ? `skip: ${guard}` : true,
      guard,
      post: { id: post.id, type: post.type, mediaUrls: post.mediaUrls, caption: post.caption, productSlug: post.productSlug, expectedPrice: post.expectedPrice },
      graphPlan: describePlan(post),
    });
  }

  if (now.hour !== PUBLISH_HOUR) return NextResponse.json({ ok: true, skipped: "not 19:00 in Asia/Jerusalem", now });

  const post = await db.instagramPost.findFirst({
    where: { scheduledFor: new Date(`${now.date}T00:00:00Z`), approved: true, status: "queued" },
    orderBy: { createdAt: "asc" },
  });
  if (!post) return NextResponse.json({ ok: true, published: null, now });

  // Claim it so an overlapping run cannot post twice.
  const claim = await db.instagramPost.updateMany({ where: { id: post.id, status: "queued" }, data: { status: "publishing" } });
  if (claim.count === 0) return NextResponse.json({ ok: true, published: null, reason: "already claimed" });

  try {
    const guard = await productGuard(post);
    if (guard) {
      await db.instagramPost.update({ where: { id: post.id }, data: { status: "skipped", error: guard } });
      return NextResponse.json({ ok: true, skipped: guard, id: post.id });
    }
    const { igMediaId, permalink } = await publishToInstagram(post);
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "published", igMediaId, permalink, publishedAt: new Date(), error: null } });
    return NextResponse.json({ ok: true, published: post.id, igMediaId, permalink });
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).slice(0, 1000);
    await db.instagramPost.update({ where: { id: post.id }, data: { status: "failed", error: msg } });
    return NextResponse.json({ ok: false, failed: post.id, error: msg }, { status: 500 });
  }
}
