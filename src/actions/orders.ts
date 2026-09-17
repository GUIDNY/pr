"use server";

import { db } from "@/lib/db";
import { getCart, getOrCreateCart } from "@/lib/cart";
import { getSession, getCurrentUser } from "@/lib/auth";
import { buildCartSummary } from "@/lib/cart-summary";
import { checkoutSchema, type CheckoutInput } from "@/lib/order-schema";
import { generateOrderNumber } from "@/lib/pricing";
import { computeDeliveryFee, requiresAddress } from "@/lib/delivery";
import { cartHasBulky, isBulkyCategory } from "@/lib/bulky";
import {
  REMOVAL_ORDERING_ENABLED,
  RECYCLING_ROW_SELECT,
  asksExceptionalQuestions,
  initialRemovalStatus,
  resolveRemovalGroup,
} from "@/lib/recycling";
import { verifyOrderAccess } from "@/lib/queries/orders";
import { paymentLaneFor } from "@/lib/pelecard/config";
import { rememberOrder, browserPlacedOrder } from "@/lib/order-receipts";
import { notifyOrder } from "@/lib/notify";
import { notifyOwnerOfNewOrder } from "@/lib/notify/owner-alert";
import { holdDays } from "@/lib/pelecard/client";

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

  /* An address is kept for the door AND for a pickup point, not only the
     door. The carrier arranges the point with the customer afterwards and
     needs to know roughly where they are; an order that arrives in the back
     office with "נקודת איסוף" and no address is one nobody can act on.
     Only collecting from our own counter has no address to record. */
  /* A collection point cannot take a fridge, and the checkout hides the
     option when the basket holds one — but the checkout is a form and a form
     can be replayed. The order is where the money and the carrier booking
     come from, so the rule is enforced here too rather than trusted to the
     screen. Silently corrected rather than rejected: the customer chose a
     free method and the two remaining ones are also free, so downgrading to
     the door costs them nothing and loses no order. */
  const basketIsBulky = cartHasBulky(
    cart.items.map((i) => ({
      isBulky: isBulkyCategory(i.product.category.slug, i.product.category.parent?.slug ?? null),
    })),
  );
  const deliveryMethod =
    data.deliveryMethod === "PICKUP_POINT" && basketIsBulky ? "DELIVERY" : data.deliveryMethod;

  const keepsAddress = requiresAddress(deliveryMethod);

  const deliveryFee = computeDeliveryFee(summary.subtotal - summary.discount, deliveryMethod);
  const total = Math.max(0, summary.subtotal - summary.discount + deliveryFee);

  /* The address goes onto the order itself, below, for every delivery order.
     This block is now only about the customer's ADDRESS BOOK — a saved address
     an account can reuse next time — which is why it is still the one thing
     here that a guest does not get: Address rows belong to a user.

     Until the order carried its own copy, this `if (session)` decided whether
     the address survived at all, and a guest's delivery order reached the back
     office with nothing under "משלוח עד הבית". */
  let addressId: string | undefined;
  if (keepsAddress) {
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
    if (paymentLaneFor(viewer) !== "gateway") {
      return { success: false as const, error: "התשלום בכרטיס אינו זמין כרגע. נסו שוב או בחרו תשלום במזומן." };
    }
  }
  /* The demo card rehearses a deposit, not a charge.
     Its whole job is to let the back office be walked end to end without a
     real card, and a rehearsal that skips the step the shop actually runs on
     rehearses the wrong thing — an order paid by demo card went straight to
     green, so the deposit queue could never be seen at all.

     Unconditional, and not tied to PELECARD_HOLD_THEN_CAPTURE. That switch
     governs what the real gateway is asked for and is off until the terminal
     is confirmed with Pelecard; this lane asks nobody for anything and moves
     no money, so making it wait on that would leave the one safe way to test
     the flow switched off for the same reason as the risky one. */
  const demoCard = data.paymentMethod === "DEMO_CARD";
  const paymentStatus = payWithPelecard ? "PENDING" : demoCard ? "AUTHORIZED" : "PENDING";
  const orderStatus = payWithPelecard ? "PAYMENT_PENDING" : demoCard ? "NEW" : "NEW";

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
      shipCity: keepsAddress ? data.city : null,
      shipStreet: keepsAddress ? data.street : null,
      shipHouseNo: keepsAddress ? data.houseNo : null,
      shipApartment: keepsAddress ? data.apartment || null : null,
      addressId,
      deliveryMethod,
      status: orderStatus,
      subtotal: summary.subtotal,
      discountTotal: summary.discount,
      /* Recomputed here rather than taken from the cart summary, which is
         built before anybody has said how the order is coming to them. A
         pickup order was being charged ₪49 to deliver something the customer
         was driving to collect. */
      deliveryFee,
      total,
      couponCode: summary.couponCode,
      paymentStatus,
      paymentMethod: data.paymentMethod,
      customerNote: data.deliveryNotes,
    },
  });

  /* One lookup for the whole basket rather than one per line. It used to be
     a findUnique inside the loop for the sku alone; the removal data needs
     the same rows, and a five-line order was five round trips to Supabase in
     Sydney at the moment the customer is watching a spinner. */
  const productRows = await db.product.findMany({
    where: { id: { in: summary.items.map((i) => i.productId) } },
    select: {
      id: true,
      sku: true,
      recyclingOptOut: true,
      recyclingCategory: { select: RECYCLING_ROW_SELECT },
      category: { select: { recyclingCategory: { select: RECYCLING_ROW_SELECT } } },
    },
  });
  const productById = new Map(productRows.map((p) => [p.id, p]));

  /* WHAT THE CUSTOMER ASKED TO HAVE TAKEN AWAY, re-derived here and not
     believed from the form.

     The browser sends product ids and nothing else. Which old appliance each
     one entitles its buyer to hand over is read from the catalogue, so a
     replayed form cannot attach a fridge's removal to a cable — and the
     person who would discover that is the driver, on the doorstep, with no
     room on the van.

     The whole block is skipped while REMOVAL_ORDERING_ENABLED is off. The
     checkout renders no checkbox then, so nothing should arrive; if
     something does, it is a form from another build or a replay, and
     recording a request the shop has no carrier for is the exact failure the
     switch exists to prevent. */
  const askedForRemoval = new Set(REMOVAL_ORDERING_ENABLED ? (data.removalProductIds ?? []) : []);
  const removalReasons = data.removalReasons ?? [];

  for (const item of summary.items) {
    const product = productById.get(item.productId)!;
    const group = resolveRemovalGroup(product);
    const requested = group !== null && askedForRemoval.has(item.productId);
    /* Exceptional only where the questions were actually put: a group that
       is not a large appliance is never chargeable, and somebody collecting
       from the Hadera counter was never asked about their stairs. Applying
       the answers to every requested line regardless would mark a kettle for
       coordination because a fridge on the same order sits on a sixth floor. */
    const exceptional =
      requested && asksExceptionalQuestions(group!, deliveryMethod) && removalReasons.length > 0;

    await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: item.productId,
        titleSnap: item.title,
        skuSnap: product.sku,
        priceSnap: item.price,
        quantity: item.quantity,
        /* Snapshotted on every eligible line, requested or not. What the
           customer was offered is worth knowing even when they said no —
           otherwise "nobody wants this" and "we never asked" look identical
           in the data. */
        recyclingKeySnap: group?.key ?? null,
        recyclingLabelSnap: group?.label ?? null,
        removalRequested: requested,
        removalExceptional: exceptional,
        /* The access answers and the note are about the property rather than
           the appliance, so they are asked once and copied onto each
           requested line. Copied rather than left on the order, so that a
           person looking at one line never has to know to look elsewhere for
           the reason it needs a phone call. */
        removalReasons: exceptional ? JSON.stringify(removalReasons) : null,
        removalNotes: requested ? (data.removalNotes ?? null) : null,
        removalAcknowledged: requested ? data.removalAcknowledged === true : false,
        removalStatus: requested ? initialRemovalStatus(deliveryMethod, exceptional) : "NOT_REQUESTED",
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

  if (!payWithPelecard && paymentStatus === "AUTHORIZED") {
    const last4 = data.cardNumber ? data.cardNumber.replace(/\s/g, "").slice(-4) : null;
    await db.payment.create({
      data: {
        orderId: order.id,
        provider: "DEMO",
        // The order's total, not the cart's: they differ on a pickup order.
        amount: total,
        amountAgorot: Math.round(total * 100),
        status: "AUTHORIZED",
        reference: last4 ? `DEMO-**** ${last4}` : "DEMO-COD",
        // The prefix is what tells the approval it may settle this one itself
        // instead of asking Pelecard — see approveOrderAction.
        authorizationUid: `DEMO-${order.orderNumber}`,
        authorizedAt: new Date(),
        holdExpiresAt: new Date(Date.now() + holdDays() * 86_400_000),
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

  // The customer is told the order exists as soon as it does, and this is the
  // one message that goes out without anybody pressing anything. It is also
  // the only one whose absence a customer notices immediately: a shop that
  // takes an order and says nothing is a shop they assume lost it.
  await notifyOrder(order.id, "ORDER_RECEIVED");
  await notifyOwnerOfNewOrder(order.id);

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
  /* AUTHORIZED counts, and has to. Under J5 the gateway holds the money
     instead of taking it, so a customer who has just paid successfully lands
     here with a held payment — refusing to empty their cart would leave them
     looking at the items they just bought, which reads as "it did not go
     through" and produces a second order. From the customer's side a hold and
     a charge are the same event: the card was accepted. */
  if (!order || (order.paymentStatus !== "CAPTURED" && order.paymentStatus !== "AUTHORIZED")) {
    return { success: false as const };
  }

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
    deliveryMethod?: "DELIVERY" | "PICKUP_POINT" | "PICKUP";
    /* The removal answers follow the fields for the same reason the address
       does: the order exists while the customer is still looking at the page
       that made it, and a tick that lands after it was created would be a
       promise made to a form and to nobody else. */
    removalProductIds?: string[];
    removalReasons?: string[];
    removalNotes?: string;
    removalAcknowledged?: boolean;
  },
) {
  const session = await getSession();

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { id: true, orderNumber: true, userId: true, status: true, paymentStatus: true, addressId: true },
  });
  if (!order) return { success: false as const };

  /* WHOSE ORDER THIS IS, and a guest's counts.
     It used to require a signed-in owner, so a guest who noticed a typo in
     their own address while the card form was open could do nothing about it —
     the fields were frozen and the only way out was to abandon the order. Most
     customers here check out without an account, so that was most customers.

     A guest proves it the way the confirmation page already makes them prove
     it: the receipt this browser got when it placed the order. And the order id
     itself is the real barrier — it is a cuid, it is never in a URL, and the
     only browser that has ever been told it is the one that created the order.
     An order number can be guessed; this cannot. */
  const ownedBySession = Boolean(session) && order.userId === session!.sub;
  const placedByThisBrowser = await browserPlacedOrder(order.orderNumber);
  if (!ownedBySession && !placedByThisBrowser) return { success: false as const };

  /* And whoever is asking, only an unpaid order in the state checkout left it
     in may be rewritten. An order that reached PAID between the keystroke and
     the save must not be changed underneath the receipt — at that point the
     address is what was charged for, and correcting it is the shop's job, not
     a form's. */
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

  /* And the old appliance, line by line. Re-derived from the catalogue here
     exactly as it is at creation — this action is reachable by anyone holding
     the order id, and "which equipment group is this" is not a question the
     caller gets to answer.

     Skipped entirely while ordering is switched off, so an old tab from a
     build that still had the checkbox cannot write a request the shop has no
     carrier for. */
  if (REMOVAL_ORDERING_ENABLED && details.removalProductIds) {
    const asked = new Set(details.removalProductIds);
    const reasons = details.removalReasons ?? [];
    const method = details.deliveryMethod ?? "DELIVERY";

    const lines = await db.orderItem.findMany({
      where: { orderId: order.id },
      select: {
        id: true,
        productId: true,
        product: {
          select: {
            recyclingOptOut: true,
            recyclingCategory: { select: RECYCLING_ROW_SELECT },
            category: { select: { recyclingCategory: { select: RECYCLING_ROW_SELECT } } },
          },
        },
      },
    });

    for (const line of lines) {
      const group = resolveRemovalGroup(line.product);
      const requested = group !== null && asked.has(line.productId) && details.removalAcknowledged === true;
      const exceptional =
        requested && asksExceptionalQuestions(group!, method) && reasons.length > 0;
      await db.orderItem.update({
        where: { id: line.id },
        data: {
          recyclingKeySnap: group?.key ?? null,
          recyclingLabelSnap: group?.label ?? null,
          removalRequested: requested,
          removalExceptional: exceptional,
          removalReasons: exceptional ? JSON.stringify(reasons) : null,
          removalNotes: requested ? (details.removalNotes ?? null) : null,
          removalAcknowledged: requested,
          removalStatus: requested ? initialRemovalStatus(method, exceptional) : "NOT_REQUESTED",
        },
      });
    }
  }

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
