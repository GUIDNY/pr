import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * Bearer check for the Chita bot. A missing CHITA_BOT_TOKEN is a closed door
 * (401), never an open one; comparison is constant-time, and a wrong length
 * is a wrong token.
 */
export function chitaBotUnauthorized(req: Request): NextResponse | null {
  const secret = process.env.CHITA_BOT_TOKEN;
  if (!secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
