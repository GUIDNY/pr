"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { BUSINESS } from "@/lib/business";
import { emailChannel } from "@/lib/notify/channels";
import { ownerAlertRecipients } from "@/lib/notify/owner-alert";

/**
 * "ביטול עסקה" — a customer's written request to cancel, from the footer form.
 *
 * Stored as an AuditLog row (entityType "CANCEL_REQUEST"), so no schema
 * change. Nothing here touches the order, the stock or the payment: the
 * request is a message to a person, who cancels (and refunds) by hand.
 *
 * The form has no email field. The confirmation goes to the address already
 * on the order the customer named — never to anything typed here — so the
 * form cannot be used to mail a stranger, and the reply on screen is the same
 * whether or not the order exists, so it cannot be used to probe order numbers.
 */

export type CancelState = { status: "idle" | "done" | "error"; message: string };

const schema = z.object({
  name: z.string().trim().min(2, "יש להזין שם מלא").max(100),
  phone: z.string().trim().min(9, "יש להזין מספר טלפון תקין").max(30),
  order: z.string().trim().min(1, "יש להזין מספר הזמנה").max(40),
  scope: z.enum(["ALL", "ITEM"]),
  item: z.string().trim().max(300).optional(),
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function submitCancelRequestAction(_prev: CancelState, form: FormData): Promise<CancelState> {
  /* Honeypot: a field no person sees. */
  if (String(form.get("website") ?? "")) return { status: "done", message: DONE };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`cancel-request:${ip}`, 5, 10 * 60_000).ok) {
    return { status: "error", message: "נסו שוב בעוד כמה דקות, או התקשרו אלינו." };
  }

  const parsed = schema.safeParse({
    name: form.get("name"),
    phone: form.get("phone"),
    order: form.get("order"),
    scope: form.get("scope"),
    item: form.get("item") || undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: parsed.error.issues[0]?.message ?? "שגיאה בטופס" };
  }
  const d = parsed.data;
  if (d.scope === "ITEM" && !d.item) {
    return { status: "error", message: "יש לכתוב איזה מוצר לבטל." };
  }

  const what = d.scope === "ALL" ? "את כל ההזמנה" : `מוצר מסוים: ${d.item}`;
  const order = await db.order.findUnique({
    where: { orderNumber: d.order },
    select: { id: true, guestEmail: true, guestPhone: true, user: { select: { email: true, phone: true } } },
  });

  await db.auditLog.create({
    data: {
      action: "cancel_request",
      entityType: "CANCEL_REQUEST",
      entityId: order?.id ?? `unmatched:${d.order}`.slice(0, 60),
      metadata: JSON.stringify({
        name: d.name,
        phone: d.phone,
        orderNumber: d.order,
        orderFound: Boolean(order),
        scope: d.scope,
        item: d.item ?? null,
      }),
    },
  });

  /* Mail is best effort: the request is already saved. */
  if (emailChannel.configured()) {
    const to = order?.guestEmail?.trim() || order?.user?.email?.trim() || null;
    const jobs: Promise<unknown>[] = [];
    if (to) {
      const body = `שלום ${d.name.split(/\s+/)[0]},\n\nקיבלנו את בקשת הביטול להזמנה ${d.order} (${what}).\nנחזור אליך תוך יום עסקים.\n\n${BUSINESS.name}`;
      jobs.push(
        emailChannel.send(to, {
          subject: `קיבלנו את בקשת הביטול להזמנה ${d.order}`,
          body,
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">${esc(body).replace(/\n/g, "<br>")}</div>`,
        }),
      );
    }
    /* Internal only: compare the last 9 digits so +972/0 prefixes do not matter. */
    const tail = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "").slice(-9);
    const known = tail(order?.guestPhone) || tail(order?.user?.phone);
    const mismatch = Boolean(order && known && tail(d.phone) !== known);
    const ownerBody = `${mismatch ? "⚠️ הטלפון בטופס לא תואם לטלפון בהזמנה\n\n" : ""}בקשת ביטול עסקה חדשה\n\nשם: ${d.name}\nטלפון: ${d.phone}\nמספר הזמנה: ${d.order}${order ? "" : " (לא נמצאה הזמנה בשם הזה)"}\nמה מבטלים: ${what}\n${to ? "נשלח אישור ללקוח." : "לא נשלח אישור ללקוח: אין כתובת מייל בהזמנה."}`;
    for (const owner of ownerAlertRecipients()) {
      jobs.push(
        emailChannel.send(owner, {
          subject: `בקשת ביטול עסקה: הזמנה ${d.order}`,
          body: ownerBody,
          html: `<div dir="rtl" style="font-family:Arial,sans-serif;line-height:1.6">${esc(ownerBody).replace(/\n/g, "<br>")}</div>`,
        }),
      );
    }
    await Promise.allSettled(jobs);
  }

  return { status: "done", message: DONE };
}

const DONE = "קיבלנו את בקשת הביטול. נחזור אליך תוך יום עסקים.";
