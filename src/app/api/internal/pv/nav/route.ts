import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pageViewFromNavigation } from "@/lib/pageview/capture";
import { resolveSid, serializeSid, SID_COOKIE, SID_IDLE_SECONDS } from "@/lib/pageview/sid";

/**
 * Where the page reports an in-app navigation (components/analytics/
 * path-log.tsx). Same record as the proxy writes for a full load, flagged
 * isRsc, with the path the page left standing in for the referrer.
 *
 * No shared secret here — the browser is the caller — so the body is
 * trusted for nothing but two paths and a query string, each checked in
 * pageViewFromNavigation, and a navigation with no visit cookie is dropped:
 * the proxy issues the cookie on the full load that must have come first,
 * and a beacon without one is not a visit this log knows. The cookie is
 * refreshed on the way out so the 30-minute idle clock restarts with the
 * page, as it does on a full load. 204 whatever happens.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  const raw = request.cookies.get(SID_COOKIE)?.value;
  const sid = resolveSid(raw);
  if (sid.isNew) return response;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const view = pageViewFromNavigation(body, request.headers, request.nextUrl.host);
    if (view) {
      await db.pageView.create({ data: { sid: sid.id, ...view } });
      response.cookies.set(SID_COOKIE, serializeSid(sid), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: SID_IDLE_SECONDS,
      });
    }
  } catch (error) {
    console.error("[pageview] navigation insert failed", error);
  }
  return response;
}
