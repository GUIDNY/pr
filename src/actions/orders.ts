"use server";

import { db } from "@/lib/db";
import { getCart, getOrCreateCart } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { buildCartSummary } from "@/lib/cart-summary";
import { checkoutSchema, type CheckoutInput } from "@/lib/order-schema";
import { generateOrderNumber } from "@/lib/pricing";
import { verifyOrderAccess } from "@/lib/queries/orders";
import { pelecardEnabled } from "@/lib/pelecard/config";

export async function createOrderAction(input: CheckoutInput) {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false as const, error: parsed.error.issues[0]?.message ?? "שגיאה בטופס" };
  }
  const data = parsed.data;

  const cart = await getOrCreateCart();
  if (cart.items.length === 0) {
    return { success: false as const, error: "העגלה ריקה" };
  }

  // never trust client prices — recompute from the authoritative cart
  const summary = await buildCartSummary(cart);
  const session = await getSession();

  let addressId: string | undefined;
  if (data.deliveryMethod === "DELIVERY") {
    if (session) {
      const address = await db.address.create({
        data: {
          userId: session.sub,
          fullName: data.fullName,
          phone: data.phone,
          city: data.city!,
          street: data.street!,
          houseNo: data.houseNo!,
          apartment: data.apartment,
          notes: data.deliveryNotes,
          isDefault: false,
        },
      });
      addressId = address.id;
    }
  }

  let orderNumber = generateOrderNumber();
  for (let i = 0; i < 5; i++) {
    const clash = await db.order.findUnique({ where: { orderNumber } });
    if (!clash) break;
    orderNumber = generateOrderNumber();
  }

  /* With a real gateway wired in, an order is never born paid: it is created
     as awaiting payment, the customer is sent to Pelecard, and only the
     server-side callback may mark it captured. The old DEMO behaviour — mark
     it paid on the spot because the form said so — stays exactly as it was
     while the flag is off, so nothing changes until it is switched on. */
  const payWithPelecard = pelecardEnabled() && data.paymentMethod === "DEMO_CARD";
  const paymentStatus = payWithPelecard ? "PENDING" : data.paymentMethod === "DEMO_CARD" ? "CAPTURED" : "PENDING";
  const orderStatus = payWithPelecard ? "PAYMENT_PENDING" : data.paymentMethod === "DEMO_CARD" ? "PAID" : "NEW";

  const order = await db.order.create({
    data: {
      orderNumber,
      userId: session?.sub,
      // Recorded for every order, signed in or not. These used to be skipped
      // whenever a session existed, on the assumption the account already held
      // the same details — but the checkout form is where the customer says who
      // this particular order is for, and that is not always themselves: a
      // different phone for the courier, a delivery to a parent, an account
      // whose profile has no phone at all. Dropping them left the order with no
      // record of the contact it was placed under, which is exactly what order
      // tracking asks for, so a signed-in order could never be looked up by the
      // details its own confirmation page showed.
      guestName: data.fullName,
      guestEmail: data.email,
      guestPhone: data.phone,
      addressId,
      deliveryMethod: data.deliveryMethod,
      status: orderStatus,
      subtotal: summary.subtotal,
      discountTotal: summary.discount,
      deliveryFee: summary.deliveryFee,
      total: summary.total,
      couponCode: summary.couponCode,
      paymentStatus,
      paymentMethod: data.paymentMethod,
      customerNote: data.deliveryNotes,
    },
  });

  for (const item of summary.items) {
    await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: item.productId,
        titleSnap: item.title,
        skuSnap: (await db.product.findUnique({ where: { id: item.productId }, select: { sku: true } }))!.sku,
        priceSnap: item.price,
        quantity: item.quantity,
      },
    });
  }

  await db.orderStatusHistory.create({
    data: { orderId: order.id, toStatus: orderStatus, note: "הזמנה נוצרה" },
  });

  if (!payWithPelecard && paymentStatus === "CAPTURED") {
    const last4 = data.cardNumber ? data.cardNumber.replace(/\s/g, "").slice(-4) : null;
    await db.payment.create({
      data: {
        orderId: order.id,
        provider: "DEMO",
        amount: summary.total,
        status: "CAPTURED",
        reference: last4 ? `DEMO-**** ${last4}` : "DEMO-COD",
      },
    });
  }

  /* A cart being emptied is the sign that the order went through. With
     Pelecard the order is not through yet — the customer is about to be sent
     to a payment page they may abandon or fail — so the cart is left alone
     and cleared once the payment is confirmed (clearPaidOrderCartAction).
     Emptying it here would leave someone whose card was declined with an
     order they cannot pay for and a cart they have to rebuild. */
  if (payWithPelecard) {
    return {
      success: true as const,
      orderId: order.id,
      orderNumber: order.orderNumber,
      requiresPayment: true as const,
      error: null,
    };
  }

  // clear the cart now that the order owns a snapshot of its contents,
  // including the checkout contact details kept in case this order was never
  // finished — the order holds them from here on, and leaving them behind
  // would put a completed customer back on the abandoned-checkout call list
  // the next time they put something in a cart.
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({
    where: { id: cart.id },
    data: {
      couponCode: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      contactAt: null,
      followUpStatus: "NEW",
      followUpNote: null,
      followUpAt: null,
      followUpById: null,
    },
  });

  return {
    success: true as const,
    orderId: order.id,
    orderNumber: order.orderNumber,
    requiresPayment: false as const,
    error: null,
  };
}

/**
 * Empties the cart once a gateway payment has actually been confirmed.
 *
 * Called from the confirmation page, and it checks the order itself rather
 * than trusting the caller: the browser arriving at that page proves nothing
 * (see the callback route), so a cart is only cleared for an order the
 * database says is captured.
 */
export async function clearPaidOrderCartAction(orderNumber: string) {
  const order = await db.order.findUnique({
    where: { orderNumber },
    select: { id: true, paymentStatus: true },
  });
  if (!order || order.paymentStatus !== "CAPTURED") return { success: false as const };

  const cart = await getCart();
  if (!cart.id) return { success: false as const };

  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({
    where: { id: cart.id },
    data: {
      couponCode: null,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      contactAt: null,
      followUpStatus: "NEW",
      followUpNote: null,
      followUpAt: null,
      followUpById: null,
    },
  });
  return { success: true as const };
}

export async function trackOrderAction(orderNumber: string, contact: string) {
  if (!orderNumber.trim() || !contact.trim()) {
    return { success: false as const, error: "יש להזין מספר הזמנה ופרטי קשר", order: null };
  }
  const order = await verifyOrderAccess(orderNumber.trim().toUpperCase(), contact.trim());
  if (!order) {
    return { success: false as const, error: "לא נמצאה הזמנה תואמת. בדקו את מספר ההזמנה ופרטי הקשר.", order: null };
  }
  return {
    success: true as const,
    error: null,
    order: {
      orderNumber: order.orderNumber,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      deliveryMethod: order.deliveryMethod,
      total: order.total,
      expectedDeliveryAt: order.expectedDeliveryAt?.toISOString() ?? null,
      items: order.items.map((i) => ({ title: i.titleSnap, quantity: i.quantity, price: i.priceSnap })),
      notes: order.notes.map((n) => ({ body: n.body, createdAt: n.createdAt.toISOString() })),
    },
  };
}
