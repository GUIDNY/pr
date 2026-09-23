import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * What Meta tells us after we hand it a WhatsApp message.
 *
 * The send API answers "accepted" and nothing more; whether the message
 * reached the phone — or fell over on Meta's side for a reason it never
 * put in that answer, a missing payment method, a number that is not on
 * WhatsApp, a template that is paused — comes here, minutes later, as a
 * status keyed by the message id we stored at send time. Each one is
 * written onto the order's notification row so the order page says what
 * actually happened rather than "sent".
 *
 * Two ways in, because a Meta app has one callback URL and this shop's
 * already points at the n8n service bot: n8n's WhatsApp trigger sees the
 * same status stream and forwards it here with the shop's internal key
 * (x-internal-key: INTERNAL_API_KEY, as the complaints ingest already
 * takes). Or Meta posts directly — GET answers its verification with
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN, and WHATSAPP_APP_SECRET, when set, checks
 * its signature. The body may be Meta's full envelope, the `value` object
 * n8n emits, a bare `{ statuses: [...] }`, or one status on its own.
 */
export const dynamic = "force-dynamic";

const STATUS_NOTE: Record<string, string> = {
  sent: "יצא מ-Meta",
  delivered: "נמסר ללקוח ✓",
  read: "נקרא על ידי הלקוח ✓",
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (
    url.searchParams.get("hub.mode") === "subscribe" &&
    token &&
    url.searchParams.get("hub.verify_token") === token
  ) {
    return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(request: Request) {
  const raw = await request.text();

  // Forwarded by n8n with the internal key, or posted by Meta with its
  // signature. One of the two has to hold.
  const internalKey = process.env.INTERNAL_API_KEY;
  const fromN8n = !!internalKey && internalKey.length >= 32 && safeEqual(request.headers.get("x-internal-key") ?? "", internalKey);
  if (!fromN8n) {
    const secret = process.env.WHATSAPP_APP_SECRET;
    if (!secret) return new Response("unauthorized", { status: 401 });
    const header = request.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    if (!safeEqual(header, expected)) return new Response("bad signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  type Status = {
    id?: string;
    status?: string;
    errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
  };
  const statuses: Status[] = [];
  const collect = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { entry?: unknown[]; changes?: unknown[]; value?: unknown; statuses?: Status[]; id?: string; status?: string };
    if (Array.isArray(n.statuses)) statuses.push(...n.statuses);
    else if (typeof n.id === "string" && typeof n.status === "string" && !n.entry && !n.value) statuses.push(n as Status);
    for (const e of n.entry ?? []) collect(e);
    for (const c of n.changes ?? []) collect(c);
    if (n.value) collect(n.value);
  };
  if (Array.isArray(payload)) payload.forEach(collect);
  else collect(payload);

  for (const s of statuses) {
    if (!s.id || !s.status) continue;
    if (s.status === "failed") {
      const e = s.errors?.[0];
      const reason = e ? `Meta ${e.code ?? ""}: ${e.title ?? e.message ?? ""}${e.error_data?.details ? ` — ${e.error_data.details}` : ""}` : "Meta: המסירה נכשלה";
      await db.orderNotification.updateMany({
        where: { providerMessageId: s.id },
        data: { status: "FAILED", error: reason.trim() },
      });
    } else if (STATUS_NOTE[s.status]) {
      // A later state never overwrites an earlier one that says more: a
      // "sent" arriving after "delivered" (they can) must not demote it.
      const rank = ["sent", "delivered", "read"];
      const rows = await db.orderNotification.findMany({
        where: { providerMessageId: s.id },
        select: { id: true, error: true },
      });
      for (const row of rows) {
        const current = Object.entries(STATUS_NOTE).find(([, note]) => note === row.error)?.[0];
        if (current && rank.indexOf(current) >= rank.indexOf(s.status)) continue;
        await db.orderNotification.update({ where: { id: row.id }, data: { status: "SENT", error: STATUS_NOTE[s.status] } });
      }
    }
  }

  // Always 200: Meta retries anything else, and a retry of a status we
  // could not use is only more of the same.
  return NextResponse.json({ ok: true });
}
