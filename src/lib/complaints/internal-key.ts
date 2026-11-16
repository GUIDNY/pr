import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

/**
 * The x-internal-key check every /api/internal/complaints route uses — the
 * n8n bot is the only caller. A key shorter than 32 characters, or none at
 * all, refuses everything rather than accepting an empty header.
 */
export function checkInternalKey(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || expected.length < 32) return false;
  const given = request.headers.get("x-internal-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so the lengths are compared
  // first — and a wrong length is already a wrong key.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function unauthorized() {
  // No detail, on purpose: this endpoint is not reachable from a browser and
  // an attacker learns nothing from the answer.
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

/** "1012" → 1012; anything else → null. */
export function parseTicketNumber(raw: string): number | null {
  return /^\d{1,9}$/.test(raw) ? Number(raw) : null;
}
