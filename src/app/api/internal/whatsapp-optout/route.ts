import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { optOutWhatsappMarketing } from "@/lib/notify/abandoned-cart-whatsapp";

/**
 * Called by the WhatsApp bot (n8n) when a customer answers "הסר". The bot
 * confirms to the customer itself; this records it so no marketing template
 * goes to that number again and the account's consent is withdrawn.
 * Same internal key as complaints/ingest.
 */
export const dynamic = "force-dynamic";

function checkInternalKey(request: Request): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected || expected.length < 32) return false;
  const a = Buffer.from(request.headers.get("x-internal-key") ?? "");
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!checkInternalKey(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { waId?: string };
  try {
    body = (await request.json()) as { waId?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const result = await optOutWhatsappMarketing(String(body.waId ?? ""));
  if (!result.ok) return NextResponse.json({ error: "invalid phone" }, { status: 400 });
  return NextResponse.json(result);
}
