import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { isVisitEventType, sanitizeEventMeta } from "@/lib/pageview/events";
import { isBotAgent, isSkippedPath } from "@/lib/pageview/capture";
import { resolveSid, serializeSid, SID_COOKIE, SID_IDLE_SECONDS } from "@/lib/pageview/sid";

/**
 * Where the page reports an action (lib/pageview/track.ts). The same
 * terms as the navigation beacon: the visit cookie must already exist,
 * the body is trusted for nothing but a type from the closed list, a path
 * and the keys that type allows, and the answer is 204 whatever happened.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PATH = /^\/(?!\/)[^\s?#]*$/;

export async function POST(request: NextRequest) {
  const response = new NextResponse(null, { status: 204 });
  const sid = resolveSid(request.cookies.get(SID_COOKIE)?.value);
  if (sid.isNew) return response;
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
    response.cookies.set(SID_COOKIE, serializeSid(sid), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: SID_IDLE_SECONDS });
  } catch (error) {
    console.error("[visit-event] insert failed", error);
  }
  return response;
}
