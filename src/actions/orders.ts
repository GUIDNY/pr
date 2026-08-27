"use server";

import { db } from "@/lib/db";
import { getOrCreateCart } from "@/lib/cart";
import { getSession } from "@/lib/auth";
import { buildCartSummary } from "@/lib/cart-summary";
import { checkoutSchema, type CheckoutInput } from "@/lib/order-schema";
import { generateOrderNumber } from "@/lib/pricing";
import { verifyOrderAccess } from "@/lib/queries/orders";

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

  const paymentStatus = data.paymentMethod === "DEMO_CARD" ? "CAPTURED" : "PENDING";
  const orderStatus = data.paymentMethod === "DEMO_CARD" ? "PAID" : "NEW";

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

  if (paymentStatus === "CAPTURED") {
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

  // clear the cart now that the order owns a snapshot of its contents
  await db.cartItem.deleteMany({ where: { cartId: cart.id } });
  await db.cart.update({ where: { id: cart.id }, data: { couponCode: null } });

  return { success: true as const, orderNumber: order.orderNumber, error: null };
}

export async function trackOrderAction(orderNumber: string, contact: string) {
  if (!orderNumber.trim() || !contact.trim()) {
    return { success: false as const, error: "יש להזין מספר הזמנה ופרטי קשר", order: null };
  }
  const order = await verifyOrderAccess(orderNumber, contact.trim());
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
