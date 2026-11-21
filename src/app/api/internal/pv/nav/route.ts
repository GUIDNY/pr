import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { pageViewFromLanding, pageViewFromNavigation } from "@/lib/pageview/capture";
import { resolveSid, serializeSid, SID_COOKIE, SID_COOKIE_OPTIONS } from "@/lib/pageview/sid";

/**
 * Where the page reports an in-app navigation (components/analytics/
 * path-log.tsx). Same record as the proxy writes for a full load, flagged
 * isRsc, with the path the page left standing in for the referrer.
 *
 * No shared secret here — the browser is the caller — so the body is
 * trusted for nothing but two paths and a query string, each checked in
 * pageViewFromNavigation. 204 whatever happens.
 *
 * THE VISIT COOKIE. Until 16 November a beacon with no visit cookie was
 * dropped, on the assumption that the proxy had issued one on the full load
 * that must have come first. That assumption failed for a paying customer:
 * a page the browser prefetched or prerendered reaches the screen without
 * the proxy issuing anything, and then every navigation and every event of
 * the visit was thrown away. So now:
 *
 *   - `landing: true` is the page's first render. With a cookie, the proxy
 *     already logged this load and nothing is written — unless the page
 *     says it was prefetched or prerendered (`prefetched: true`), which the
 *     proxy never logs. Without a cookie, a visit id is issued here and the
 *     page is logged (pageViewFromLanding).
 *   - an ordinary navigation with no cookie (a prefetched landing whose
 *     beacon was lost, or a visit that sat idle past 30 minutes) is logged
 *     under a fresh id rather than dropped.
 *
 * The cookie is the same one the proxy issues — same name, same lifetime,
 * same flags — and is refreshed on the way out so the 30-minute idle clock
 * restarts with the page, as it does on a full load.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  const sid = resolveSid(request.cookies.get(SID_COOKIE)?.value);

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const landing = body.landing === true;
    /* A page the browser prefetched or prerendered was never logged by the
       proxy (a prefetch is not a view), even when the proxy issued the
       cookie on it — so that landing is logged whether or not the cookie
       came along. Any other landing with a cookie is the proxy's row. */
    if (landing && !sid.isNew && body.prefetched !== true) return response;

    const view = landing
      ? pageViewFromLanding(body, request.headers, request.nextUrl.host)
      : pageViewFromNavigation(body, request.headers, request.nextUrl.host);
    if (view) {
      await db.pageView.create({ data: { sid: sid.id, ...view } });
      response.cookies.set(SID_COOKIE, serializeSid(sid), SID_COOKIE_OPTIONS);
    }
  } catch (error) {
    console.error("[pageview] navigation insert failed", error);
  }
  return response;
}
