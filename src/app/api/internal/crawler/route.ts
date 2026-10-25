import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Where the proxy hands a crawler's request to the database.
 *
 * Same shape as the page-view route beside it and for the same reasons: the
 * proxy runs at the edge with no database, POSTs here under waitUntil and
 * never waits, this answers 204 whatever happens, and a shared secret keeps
 * everyone else out. A failed log line must never become a failed page, and
 * for a crawler that matters twice over — a slow response today is a
 * smaller crawl budget tomorrow.
 *
 * What this records and PageView does not: the RSC fetches, the requests
 * that never asked for HTML, and the agent string itself. Those are most of
 * what a crawler actually spends its visit on.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  bot: z.string().min(1).max(60),
  userAgent: z.string().min(1).max(512),
  path: z.string().min(1).max(300),
  query: z.string().max(500).nullable(),
  isRsc: z.boolean(),
  accept: z.string().max(120).nullable(),
  status: z.number().int().min(100).max(599).nullable(),
  ip: z.string().max(64).nullable(),
  country: z.string().max(2).nullable(),
});

/** The same secret the page-view route uses; this is the same caller. */
function crawlerSecret(): string | null {
  return process.env.PV_SECRET || process.env.INTERNAL_API_KEY || null;
}

export async function POST(request: Request) {
  const expected = crawlerSecret();
  const given = request.headers.get("x-pv-secret");
  if (!expected || !given || given !== expected) return new NextResponse(null, { status: 204 });
  try {
    const parsed = body.safeParse(await request.json());
    if (parsed.success) await db.crawlerHit.create({ data: parsed.data });
  } catch (error) {
    console.error("[crawler] insert failed", error);
  }
  return new NextResponse(null, { status: 204 });
}
