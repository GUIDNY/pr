import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { canManageCatalog } from "@/lib/permissions";
import { sendAbandonedCartReminders } from "@/lib/notify/abandoned-cart-whatsapp";

/**
 * Every quarter hour: the one "everything all right?" WhatsApp to customers
 * who left the checkout after ticking the advertising-consent box. All the
 * rules (once, consent, opt-out, settle time) live in the lib, so this route
 * is only the door. Does nothing until ABANDONED_CART_WHATSAPP=1.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (!(secret && auth === `Bearer ${secret}`)) {
    const session = await getSession();
    if (!session || !canManageCatalog(session.role)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const result = await sendAbandonedCartReminders();
  return NextResponse.json({ ok: true, ...result });
}
