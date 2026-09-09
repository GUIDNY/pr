"use server";

import { db } from "@/lib/db";
import { getCart, getOrCreateCart } from "@/lib/cart";
import { getSession, getCurrentUser } from "@/lib/auth";
import { buildCartSummary } from "@/lib/cart-summary";
import { checkoutSchema, type CheckoutInput } from "@/lib/order-schema";
import { generateOrderNumber } from "@/lib/pricing";
import { verifyOrderAccess } from "@/lib/queries/orders";
import { paymentLaneFor } from "@/lib/pelecard/config";
import { rememberOrder } from "@/lib/order-receipts";

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

  const isDelivery = data.deliveryMethod === "DELIVERY";

  /* The address goes onto the order itself, below, for every delivery order.
     This block is now only about the customer's ADDRESS BOOK — a saved address
     an account can reuse next time — which is why it is still the one thing
     here that a guest does not get: Address rows belong to a user.

     Until the order carried its own copy, this `if (session)` decided whether
     the address survived at all, and a guest's delivery order reached the back
     office with nothing under "משלוח עד הבית". */
  let addressId: string | undefined;
  if (isDelivery) {
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
  const payWithPelecard = data.paymentMethod === "PELECARD";
  if (payWithPelecard) {
    /* Asked again here, on the server, about the account on the cookie — not
       about the email in `data`, which is whatever the shopper typed. The form
       only sends PELECARD when the page told it the gateway was on for this
       viewer; re-checking is what makes that a statement about the viewer
       rather than a field a request can set for itself.

       Refusing is the only safe answer when the two disagree: the alternative
       is an order nobody can pay for, or worse, one marked paid. */
    const viewer = await getCurrentUser();
    if (paymentLaneFor(viewer?.email) !== "gateway") {
      return { success: false as const, error: "התשלום בכרטיס אינו זמין כרגע. נסו שוב או בחרו תשלום במזומן." };
    }
  }
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
      // Where this order is going, recorded on the order for everyone. A
      // pickup order has no address to record.
      shipCity: isDelivery ? data.city : null,
      shipStreet: isDelivery ? data.street : null,
      shipHouseNo: isDelivery ? data.houseNo : null,
      shipApartment: isDelivery ? data.apartment || null : null,
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

  // What lets the confirmation page tell this buyer from a stranger who typed
  // an order number. Set before either return below, including the gateway
  // one — that customer reaches the same page after paying.
  await rememberOrder(order.orderNumber);

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

/**
 * Keeps a pending order's contact and address in step with the form while its
 * payment form is already open.
 *
 * The card form opens as soon as the checkout has enough to create an order
 * with, which means the order exists while the customer may still be editing
 * the details it was made from. Freezing the fields was the first answer and
 * it was the wrong one: a signed-in shopper whose address is already on file
 * had the form open before they had touched anything, and then could not
 * correct a street name.
 *
 * So the fields stay live and the order follows them, the delivery method
 * included.
 *
 * NOTHING ON THE CHECKOUT PAGE MOVES THE TOTAL, which is worth writing down
 * because it was assumed otherwise and the assumption cost a bug. The delivery
 * method looked like the exception and is not: computeDeliveryFee() in
 * cart-summary.ts takes the discounted subtotal and nothing else, so pickup
 * and home delivery cost the same. The radio was disabled while a payment was
 * open to protect an amount that cannot change, and since choosing pickup drops
 * the address requirement and opens the form immediately, the effect was a
 * one-way door: pickup could be chosen and never undone.
 *
 * If a delivery fee ever does depend on the method, or a coupon field arrives
 * on this page, this stops being true and the open transaction has to be
 * reopened rather than followed.
 *
 * Signed-in orders only. A guest's order has no owner to check against, and an
 * order id is not an authorisation to change where a delivery goes.
 */
export async function updatePendingOrderDetailsAction(
  orderId: string,
  details: {
    fullName: string;
    email: string;
    phone: string;
    city?: string;
    street?: string;
    houseNo?: string;
    apartment?: string;
    deliveryNotes?: string;
    deliveryMethod?: "DELIVERY" | "PICKUP";
  },
) {
  const session = await getSession();
  if (!session) return { success: false as const };

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, status: true, paymentStatus: true, addressId: true },
  });

  /* Three conditions, and each of them is the difference between an edit and
     something else: the order is this account's, it has not been paid, and it
     is still in the state the checkout left it in. An order that reached PAID
     between the keystroke and the save must not be rewritten underneath the
     receipt. */
  if (!order || order.userId !== session.sub) return { success: false as const };
  if (order.status !== "PAYMENT_PENDING" || order.paymentStatus !== "PENDING") {
    return { success: false as const };
  }

  await db.order.update({
    where: { id: order.id },
    data: {
      guestName: details.fullName,
      guestEmail: details.email,
      guestPhone: details.phone,
      customerNote: details.deliveryNotes,
      ...(details.deliveryMethod ? { deliveryMethod: details.deliveryMethod } : {}),
    },
  });

  if (order.addressId && details.city && details.street && details.houseNo) {
    await db.address.update({
      where: { id: order.addressId },
      data: {
        fullName: details.fullName,
        phone: details.phone,
        city: details.city,
        street: details.street,
        houseNo: details.houseNo,
        apartment: details.apartment,
        notes: details.deliveryNotes,
      },
    });
  }

  return { success: true as const };
}
