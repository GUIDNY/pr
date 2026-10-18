import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

/**
 * Where the proxy hands a page view to the database.
 *
 * The proxy runs at the edge and has no database; it POSTs here with
 * waitUntil and never waits for the answer. So this route does one insert,
 * says nothing useful back (204 whatever happens — a failed log line must
 * never become a failed page), and refuses anyone who is not the proxy by a
 * shared secret in a header. The body is validated to the same lengths the
 * capture already enforces, because a route that trusts its caller is a
 * route that stores whatever arrives.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({
  sid: z.string().min(8).max(64),
  path: z.string().min(1).max(300),
  query: z.string().max(500).nullable(),
  referrer: z.string().max(200).nullable(),
  isBot: z.boolean(),
  isRsc: z.boolean(),
  country: z.string().max(2).nullable(),
  device: z.enum(["mobile", "tablet", "desktop"]).nullable(),
});

/** PV_SECRET when it is set; the internal key otherwise, so the log starts
    working without a new secret. Either way it never leaves the server. */
function pageViewSecret(): string | null {
  return process.env.PV_SECRET || process.env.INTERNAL_API_KEY || null;
}

export async function POST(request: Request) {
  const expected = pageViewSecret();
  const given = request.headers.get("x-pv-secret");
  if (!expected || !given || given !== expected) return new NextResponse(null, { status: 204 });
  try {
    const parsed = body.safeParse(await request.json());
    if (parsed.success) await db.pageView.create({ data: parsed.data });
  } catch (error) {
    console.error("[pageview] insert failed", error);
  }
  return new NextResponse(null, { status: 204 });
}
