import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { loadInsights } from "@/lib/instagram-insights";

/**
 * Read-only Instagram numbers (posts, stories, followers, visits from Instagram).
 * Behind the admin session; uses the token already stored in Vercel and never
 * returns or logs it. Page: /admin/instagram.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const session = await getSession();
  if (!session || !canManageCatalog(session.role)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await loadInsights(), { headers: { "Cache-Control": "no-store" } });
}
