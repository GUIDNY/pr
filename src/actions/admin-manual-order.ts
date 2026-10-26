"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireBackOffice } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { generateOrderNumber } from "@/lib/pricing";
import { requiresAddress } from "@/lib/delivery";
import { MANUAL_PAYMENT_METHOD_LABELS } from "@/lib/enums";
import {
  manualOrderSchema,
  manualOrderTotals,
  manualOrderAttribution,
  type ManualOrderInput,
} from "@/lib/manual-order";

/**
 * The second door into the Order table: a sale made on the phone.
 *
 * See lib/manual-order.ts for the three rules this honours — the price is
 * typed in and may be below cost, stock is never written, and the customer
 * hears nothing until somebody presses send.
 *
 * Written as one transaction. A half-made order is worse than none: the
 * salesperson is still on the call, they would retype it, and the shop
 * would hold two.
 */

type Result = { success: boolean; error: string | null; orderNumber?: string };

/** The picker's search: title or SKU, with the two numbers the form needs. */
export async function searchProductsForOrderAction(query: string) {
  await requireBackOffice();
  const q = query.trim();
  if (q.length < 2) return [];
  return db.product.findMany({
    where: {
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
      ],
    },
    /* Unpublished and out-of-stock products are deliberately searchable.
       A phone order is very often for exactly those: the thing that is not
       on the site yet, or the last one in the showroom. The form shows the
       stock and the published state beside each result so the person
       choosing can see what they are choosing. */
    select: {
      id: true,
      title: true,
      sku: true,
      price: true,
      supplierCost: true,
      stockQty: true,
      isPublished: true,
    },
    orderBy: [{ stockQty: "desc" }, { title: "asc" }],
    take: 12,
  });
}

export async function createManualOrderAction(input: ManualOrderInput): Promise<Result> {
  const session = await requireBackOffice();

  const parsed = manualOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "הטופס לא תקין" };
  }
  const data = parsed.data;

  /* One product may not appear on two lines: the order would be right and
     every later read of it — the picking list, the supplier order, the
     "how many of these have we sold" query — would have to know to add
     them up. Quantity is the field for that. */
  const ids = data.lines.map((l) => l.productId);
  if (new Set(ids).size !== ids.length) {
    return { success: false, error: "אותו מוצר מופיע פעמיים. אפשר לשנות כמות במקום." };
  }

  const products = await db.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, sku: true, title: true, supplierCost: true },
  });
  if (products.length !== ids.length) {
    return { success: false, error: "חלק מהמוצרים כבר לא קיימים — רעננו את הדף" };
  }
  const byId = new Map(products.map((p) => [p.id, p]));

  const lines = data.lines.map((line) => {
    const product = byId.get(line.productId)!;
    return {
      ...line,
      product,
      /* The cost on the day, exactly as the checkout snapshots it: a cost
         of zero or less is "not on record" rather than free. */
      unitCost: product.supplierCost && product.supplierCost > 0 ? product.supplierCost : null,
    };
  });

  const { subtotal, total } = manualOrderTotals(lines, data.deliveryFee, data.deliveryCost ?? null);

  let orderNumber = generateOrderNumber();
  for (let i = 0; i < 5; i++) {
    const clash = await db.order.findUnique({ where: { orderNumber }, select: { id: true } });
    if (!clash) break;
    orderNumber = generateOrderNumber();
  }

  /* Paid goes straight to PROCESSING, the same place markPaidManuallyAction
     puts an order it has just settled — there is nothing left to wait for
     and the order belongs in the work queue. Unpaid stays NEW rather than
     PAYMENT_PENDING: that status means a gateway page is open and a
     callback is expected, and here nobody is waiting on a machine. */
  const status = data.paid ? "PROCESSING" : "NEW";
  const keepsAddress = requiresAddress(data.deliveryMethod);
  const now = new Date();
  const email = data.customerEmail?.trim() || null;
  const by = session.name || "הבק-אופיס";
  const note = data.paid
    ? `הזמנה נוצרה ידנית (${by}) — שולמה ב${MANUAL_PAYMENT_METHOD_LABELS[data.paymentMethod!]}`
    : `הזמנה נוצרה ידנית (${by}) — טרם שולמה`;

  const order = await db.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        orderNumber,
        /* No userId. The person on the phone may well have an account, but
           matching them by a name and a number typed under time pressure
           is how one customer's order lands in another's history. The
           guest fields hold what was actually said. */
        guestName: data.customerName,
        guestEmail: email,
        guestPhone: data.customerPhone,
        attribution: manualOrderAttribution(now),
        shipCity: keepsAddress ? data.city || null : null,
        shipStreet: keepsAddress ? data.street || null : null,
        shipHouseNo: keepsAddress ? data.houseNo || null : null,
        shipApartment: keepsAddress ? data.apartment || null : null,
        deliveryMethod: data.deliveryMethod,
        status,
        subtotal,
        deliveryFee: data.deliveryFee,
        deliveryCost: data.deliveryCost ?? null,
        total,
        paymentStatus: data.paid ? "CAPTURED" : "PENDING",
        paymentMethod: data.paid ? data.paymentMethod : null,
        customerNote: data.customerNote || null,
        /* Nobody ticked a consent box on a phone call, so neither of these
           may default to yes. WhatsApp defaults to true for a web order
           because the customer saw the tick; here there was no tick. */
        whatsappOptIn: false,
        marketingOptIn: false,
      },
    });

    await tx.orderItem.createMany({
      data: lines.map((line) => ({
        orderId: created.id,
        productId: line.productId,
        titleSnap: line.product.title,
        skuSnap: line.product.sku,
        priceSnap: line.unitPrice,
        costSnap: line.unitCost,
        quantity: line.quantity,
      })),
    });

    if (data.paid) {
      await tx.payment.create({
        data: {
          orderId: created.id,
          provider: "MANUAL",
          amount: total,
          amountAgorot: Math.round(total * 100),
          status: "CAPTURED",
          reference: data.paymentReference || null,
          capturedAt: now,
          environment: "production",
          rawResponse: {
            manual: {
              method: data.paymentMethod,
              reference: data.paymentReference || null,
              by: session.sub,
              at: now.toISOString(),
              origin: "manual-order",
            },
          },
        },
      });
    }

    await tx.orderStatusHistory.create({
      data: { orderId: created.id, toStatus: status, changedById: session.sub, note },
    });

    return created;
  });

  await logAudit({
    actorId: session.sub,
    action: "ORDER_CREATED_MANUALLY",
    entityType: "Order",
    entityId: order.id,
    metadata: {
      orderNumber: order.orderNumber,
      total,
      lines: lines.length,
      paid: data.paid,
      paymentMethod: data.paymentMethod ?? null,
    },
  });

  /* Not sent to GA4, unlike a web order that is marked paid by hand. That
     one really happened on the site and GA4 is missing only its payment;
     this one never touched the website, and reporting it as a web purchase
     would credit the shop's own phone line to whichever channel GA4 last
     saw. The order is in the dashboard's own revenue either way.

     Not notified either, and not awarded club points: there is no account
     to award them to. Both are the owner's rule of 26 October — nothing
     reaches a customer because somebody pressed a button here. */

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { success: true, error: null, orderNumber: order.orderNumber };
}
