"use server";

import { headers } from "next/headers";
import { notifyCallbackRequested } from "@/lib/notify/payment-alert";
import { rateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";

export type CallbackState = { status: "idle" | "done" | "error"; message?: string };

/** Israeli mobile or landline, digits only, 9–10 of them. */
function cleanPhone(raw: string): string | null {
  const digits = raw.replace(/[^\d+]/g, "").replace(/^\+972/, "0");
  return /^0\d{8,9}$/.test(digits) ? digits : null;
}

/**
 * "רוצים שנחזור אליכם?" on the failure page. Tells the shop by mail
 * (notifyCallbackRequested) and notes it on the order. Sends the customer
 * nothing. The order number is the only key, so it is rate-limited and the
 * mail goes out once per order.
 */
export async function requestCallbackAction(_prev: CallbackState, form: FormData): Promise<CallbackState> {
  const orderNumber = String(form.get("order") ?? "").trim().slice(0, 40);
  if (!orderNumber) return { status: "error", message: "לא נמצאה הזמנה. אפשר להתקשר אלינו." };

  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`callback:${ip}`, 5, 10 * 60_000).ok) {
    return { status: "error", message: "נסו שוב בעוד כמה דקות, או התקשרו אלינו." };
  }

  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { guestPhone: true, user: { select: { phone: true } } },
  });
  if (!order) return { status: "error", message: "לא נמצאה הזמנה. אפשר להתקשר אלינו." };

  const known = order.guestPhone?.trim() || order.user?.phone?.trim() || null;
  const typed = String(form.get("phone") ?? "").trim();
  const phone = known ? null : cleanPhone(typed);
  if (!known && !phone) return { status: "error", message: "נא להזין מספר טלפון תקין." };

  await notifyCallbackRequested(orderNumber, phone);
  /* Already asked, or sent: either way the customer's answer is the same. */
  return { status: "done" };
}
