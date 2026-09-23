import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

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
 * Set up once in the Meta app: Webhooks → WhatsApp → callback URL
 * https://buytoday.co.il/api/whatsapp/webhook, the verify token from
 * WHATSAPP_WEBHOOK_VERIFY_TOKEN, and the "messages" field subscribed.
 * WHATSAPP_APP_SECRET, when set, is used to check Meta's signature on
 * every delivery; without it the payload is trusted, which is fine for
 * status rows and nothing else is done with it.
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

  const secret = process.env.WHATSAPP_APP_SECRET;
  if (secret) {
    const header = request.headers.get("x-hub-signature-256") ?? "";
    const expected = "sha256=" + createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return new Response("bad signature", { status: 401 });
    }
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
  const entries = (payload as { entry?: { changes?: { value?: { statuses?: Status[] } }[] }[] })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const s of change.value?.statuses ?? []) statuses.push(s);
    }
  }

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
