import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";

/**
 * Nightly: fold yesterday's page views into a daily table, and drop raw rows
 * older than 90 days.
 *
 * The raw log carries a session id, which is why it has a shelf life. The
 * daily table — date, path, bot or not, views, distinct sessions — carries
 * none, so it is kept for good and is what a year-over-year question reads.
 *
 * Every past day is re-aggregated each night rather than only yesterday:
 * the raw table is bounded at 90 days, the query is one GROUP BY, and a
 * night the cron missed then costs nothing — the next run catches it up.
 * Days are the shop's days (Asia/Jerusalem), because "yesterday" to the
 * person reading this is not yesterday in UTC.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const RETENTION_DAYS = 90;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!(secret && auth === `Bearer ${secret}`)) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const aggregated = await db.$executeRawUnsafe(`
    INSERT INTO "PageViewDaily" ("id", "date", "path", "isBot", "views", "sessions")
    SELECT md5(d::text || '|' || path || '|' || "isBot"::text), d, path, "isBot", count(*)::int, count(DISTINCT sid)::int
    FROM (
      SELECT (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem')::date AS d, path, "isBot", sid
      FROM "PageView"
      WHERE "createdAt" < ((date_trunc('day', now() AT TIME ZONE 'Asia/Jerusalem')) AT TIME ZONE 'Asia/Jerusalem')
    ) t
    GROUP BY d, path, "isBot"
    ON CONFLICT ("date", "path", "isBot") DO UPDATE SET "views" = EXCLUDED."views", "sessions" = EXCLUDED."sessions"
  `);
  const deleted = await db.$executeRawUnsafe(
    `DELETE FROM "PageView" WHERE "createdAt" < now() - interval '${RETENTION_DAYS} days'`,
  );

  return NextResponse.json({ ok: true, aggregatedRows: aggregated, deletedRaw: deleted, retentionDays: RETENTION_DAYS });
}
