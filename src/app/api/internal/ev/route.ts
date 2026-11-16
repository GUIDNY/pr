import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isVisitEventType, sanitizeEventMeta } from "@/lib/pageview/events";
import { isBotAgent, isSkippedPath } from "@/lib/pageview/capture";
import { resolveSid, serializeSid, SID_COOKIE, SID_COOKIE_OPTIONS } from "@/lib/pageview/sid";

/**
 * Where the page reports an action (lib/pageview/track.ts). The same
 * terms as the navigation beacon: the body is trusted for nothing but a
 * type from the closed list, a path and the keys that type allows, and the
 * answer is 204 whatever happened.
 *
 * An event with no visit cookie is logged under a fresh id, which is then
 * issued, instead of being dropped. Until 16 November it was dropped, and
 * that is how a buyer's add-to-cart, first order and payment form went
 * unrecorded: the page had reached the screen prefetched, so the proxy never
 * issued a cookie — see api/internal/pv/nav for the whole account.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = /^\/(?!\/)[^\s?#]*$/;

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  const sid = resolveSid(request.cookies.get(SID_COOKIE)?.value);
  try {
    const body = (await request.json()) as { type?: unknown; path?: unknown; meta?: unknown };
    if (!isVisitEventType(body.type)) return response;
    const path = typeof body.path === "string" && PATH.test(body.path) && body.path.length <= 300 ? body.path : "/";
    if (isSkippedPath(path)) return response;
    await db.visitEvent.create({
      data: {
        sid: sid.id,
        type: body.type,
        path,
        meta: sanitizeEventMeta(body.type, body.meta) ?? undefined,
        isBot: isBotAgent(request.headers.get("user-agent")),
        isRsc: true,
      },
    });
    response.cookies.set(SID_COOKIE, serializeSid(sid), SID_COOKIE_OPTIONS);
  } catch (error) {
    console.error("[visit-event] insert failed", error);
  }
  return response;
}
