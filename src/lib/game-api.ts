import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/site-url";
import { GAME_ORIGIN } from "@/lib/game-profile";

/**
 * What every /api/game/* route answers the 3D mall with, in one place.
 *
 * The game is play.buytoday.co.il, another origin on the same site, and it
 * calls these with `credentials: "include"`. CORS names exactly that origin
 * (never "*", which cannot carry credentials, and never a reflected Origin,
 * which would hand any page a signed-in visitor's data). Personal answers,
 * so never cached, and Vary: Origin so no shared cache can mix them up.
 */
export function gameCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": GAME_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

export function gameJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: gameCorsHeaders() });
}

/** The preflight: answered for any origin, only the game's is named. */
export function gamePreflight(methods: string) {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...gameCorsHeaders(),
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}

/**
 * Is this write coming from a page allowed to make it? The game, or the shop
 * itself (its configured address, or the address this request reached, which
 * differ on a preview). A browser does not let a page lie about its Origin,
 * and every browser sends one on a cross-origin write, so a request without
 * one was not a page asking and is refused. This is the CSRF rule: CORS only
 * stops another page reading an answer, not sending the request.
 */
export function gameOriginAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === GAME_ORIGIN) return true;
  return origin === new URL(SITE_URL).origin || origin === new URL(request.url).origin;
}

/** A JSON body read no further than `limit` bytes; null when it is larger. */
export async function readGameBody(request: Request, limit: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > limit) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}
