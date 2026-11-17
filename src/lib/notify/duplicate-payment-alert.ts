import "server-only";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { emailChannel } from "./channels";
import { ownerAlertRecipients, pushToOwnerDevices, teamAlertRecipients } from "./owner-alert";
import {
  DUPLICATE_WINDOW_MINUTES,
  findDuplicatePayments,
  type DuplicateReason,
  type PaidOrderLike,
} from "./duplicate-payment-match";

const EVENT = "DUPLICATE_PAYMENT_ALERT";

const REASON_HE: Record<DuplicateReason, string> = {
  phone: "אותו טלפון",
  email: "אותו מייל",
  visit: "אותו ביקור באתר",
};

const SELECT = {
  id: true,
  orderNumber: true,
  total: true,
  createdAt: true,
  paymentStatus: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  visitSid: true,
  user: { select: { name: true, phone: true, email: true } },
} as const;

type Row = {
  id: string;
  orderNumber: string;
  total: number;
  createdAt: Date;
  paymentStatus: string;
  guestName: string | null;
  guestPhone: string | null;
  guestEmail: string | null;
  visitSid: string | null;
  user: { name: string | null; phone: string | null; email: string | null } | null;
};

function toLike(r: Row): PaidOrderLike {
  return {
    id: r.id,
    orderNumber: r.orderNumber,
    total: r.total,
    createdAt: r.createdAt,
    paymentStatus: r.paymentStatus,
    phone: r.guestPhone ?? r.user?.phone ?? null,
    email: r.guestEmail ?? r.user?.email ?? null,
    visitSid: r.visitSid,
  };
}

const whenIL = (at: Date) =>
  new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" }).format(at);
const money = (n: number) => `${n.toLocaleString("he-IL")} ₪`;

/**
 * Called from the Pelecard callback right after an order becomes paid. When
 * the same customer already has another paid order within the window, the
 * owner (push + email) and the team (email) are told at once, so a duplicate
 * authorisation is released before it is ever captured.
 *
 * Once per order: the (orderId, channel, event) unique row is the lock.
 * Never throws — it runs after the customer has their answer.
 */
export async function notifyIfDuplicatePayment(orderId: string): Promise<void> {
  try {
    const row = (await db.order.findUnique({ where: { id: orderId }, select: SELECT })) as Row | null;
    if (!row) return;
    const order = toLike(row);
    const windowMs = DUPLICATE_WINDOW_MINUTES * 60_000;
    /* Every paid order in the window, matched in memory: a shop this size has
       a handful an hour, and phone spellings differ too much to match in SQL. */
    const candidates = (await db.order.findMany({
      where: {
        id: { not: order.id },
        paymentStatus: { in: ["AUTHORIZED", "CAPTURED"] },
        createdAt: { gte: new Date(order.createdAt.getTime() - windowMs), lte: new Date(order.createdAt.getTime() + windowMs) },
      },
      select: SELECT,
      take: 200,
    })) as Row[];
    const dupes = findDuplicatePayments(order, candidates.map(toLike));
    if (dupes.length === 0) return;

    const all = [...dupes.map((d) => d.order), order].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const reasons = [...new Set(dupes.flatMap((d) => d.reasons))].map((r) => REASON_HE[r]).join(", ");
    const name = row.guestName?.trim() || row.user?.name?.trim() || "לקוח ללא שם";
    const lines = all.map((o) => `${o.orderNumber} · ${money(o.total)} · ${whenIL(o.createdAt)} · ${o.paymentStatus}`);
    const title = `חשד לחיוב כפול · ${name} · ${all.length} תשלומים`;
    const body = `${lines.join("\n")}\n(${reasons}). לבדוק ולשחרר את ההרשאה הכפולה בפלאקארד לפני גבייה.`;

    const recipients = [...new Set([...ownerAlertRecipients(), ...teamAlertRecipients()])];

    // Push to the owner's phone — the lock is the PUSH row.
    try {
      await db.orderNotification.create({ data: { orderId: order.id, channel: "PUSH", event: EVENT, recipient: "owner" } });
      const pushed = await pushToOwnerDevices(title, body, "buytoday-orders");
      await db.orderNotification.updateMany({
        where: { orderId: order.id, channel: "PUSH", event: EVENT },
        data: pushed.ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: pushed.error.slice(0, 300) },
      });
    } catch {
      /* already sent for this order */
    }

    if (recipients.length && emailChannel.configured()) {
      try {
        await db.orderNotification.create({
          data: { orderId: order.id, channel: "EMAIL", event: EVENT, recipient: recipients.join(",") },
        });
        const links = all.map((o) => `${SITE_URL}/admin/orders/${o.id}`).join("\n");
        const text = `${title}\n\n${body}\n\n${links}`;
        const html = `<div dir="rtl" style="font-family:Arial,sans-serif"><h2 style="color:#b91c1c">${title}</h2><pre style="font-family:inherit">${body}</pre><p>${all
          .map((o) => `<a href="${SITE_URL}/admin/orders/${o.id}">${o.orderNumber}</a>`)
          .join(" · ")}</p></div>`;
        const results = await Promise.all(
          recipients.map((to) => emailChannel.send(to, { subject: title, body: text, html }).catch(() => null)),
        );
        const ok = results.some((r) => r !== null);
        await db.orderNotification.updateMany({
          where: { orderId: order.id, channel: "EMAIL", event: EVENT },
          data: ok ? { status: "SENT", sentAt: new Date() } : { status: "FAILED", error: "send failed" },
        });
      } catch {
        /* already sent for this order */
      }
    }
  } catch (error) {
    console.error("[duplicate-payment] could not check or report", { orderId, error });
  }
}
