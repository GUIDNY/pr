"use server";

import { db } from "@/lib/db";
import { currentVisitSid } from "@/lib/pageview/visit.server";
import { getCart, getOrCreateCart } from "@/lib/cart";
import { getSession, getCurrentUser } from "@/lib/auth";
import { buildCartSummary } from "@/lib/cart-summary";
import { checkoutSchema, type CheckoutInput } from "@/lib/order-schema";
import { generateOrderNumber } from "@/lib/pricing";
import { PICKUP_ENABLED, computeDeliveryFee, deliveryFeeAfterMethodChange, requiresAddress } from "@/lib/delivery";
import { cartHasBulky, isBulkyCategory } from "@/lib/bulky";
import { verifyOrderAccess } from "@/lib/queries/orders";
import { paymentLaneFor } from "@/lib/pelecard/config";
import { rememberOrder, browserPlacedOrder } from "@/lib/order-receipts";
import { notifyOrder } from "@/lib/notify";
import { notifyOwnerOfNewOrder } from "@/lib/notify/owner-alert";
import { holdDays } from "@/lib/pelecard/client";
import { rememberAddress } from "@/lib/address-book";
import { retireGameCoupon } from "@/lib/game-wheel";
import { findRecentlyPaidOrder } from "@/lib/paid-cart";
import { awardPurchase } from "@/lib/game-levels";
import { cookies } from "next/headers";
import { ATTRIBUTION_COOKIE, attributionFromJson, gclidOf, isRealClickId, parseAttribution } from "@/lib/attribution";
import { REFERRAL_CODE_PREFIX, REFERRAL_COOKIE, REFERRAL_FLAG_COOKIE } from "@/lib/referral-rules";

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

  const session = await getSession();

  /* The same basket was just paid for, by this account or in this visit:
     answer with that order instead of making a second one. The callback
     empties the cart when a payment clears, so this is for the cases it
     cannot reach — see lib/paid-cart.ts. The paid order's products leave the
     cart here too, which is what the callback would have done. */
  const recentlyPaid = await findRecentlyPaidOrder({
    userId: session?.sub,
    visitSid: await currentVisitSid(),
    phone: data.phone,
    email: data.email,
    items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
  });
  const alreadyPaid = recentlyPaid.exact;
  /* Some of these products — not the whole basket — were paid for a few
     minutes ago. Not refused: the customer may really want a second one. But
     they are asked first, and only an explicit "yes, order again" goes on. */
  if (!alreadyPaid && recentlyPaid.overlap && !data.confirmPaidOverlap) {
    return {
      success: false as const,
      error: `חלק מהמוצרים בסל כבר שולמו בהזמנה ${recentlyPaid.overlap.orderNumber} לפני כמה דקות.`,
      paidOverlapOrderNumber: recentlyPaid.overlap.orderNumber,
    };
  }
  if (alreadyPaid) {
    if (cart.id) {
      await db.cartItem.deleteMany({
        where: { cartId: cart.id, productId: { in: cart.items.map((i) => i.productId) } },
      });
    }
    return {
      success: false as const,
      error: `ההזמנה ${alreadyPaid} כבר שולמה. אין צורך לשלם שוב.`,
      alreadyPaidOrderNumber: alreadyPaid,
    };
  }

  // never trust client prices — recompute from the authoritative cart. The
  // form's email goes in so a coupon limited per customer, or to a first
  // order, is judged against the person actually ordering.
  const summary = await buildCartSummary(cart, { userId: session?.sub, email: data.email });

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
  const deliveryMethod = !PICKUP_ENABLED
    ? "DELIVERY"
    : data.deliveryMethod === "PICKUP_POINT" && basketIsBulky
      ? "DELIVERY"
      : data.deliveryMethod;

  const keepsAddress = requiresAddress(deliveryMethod);

  const deliveryFee = summary.freeDelivery ? 0 : computeDeliveryFee(summary.subtotal - summary.discount, deliveryMethod);
  const total = Math.max(0, summary.subtotal - summary.discount + deliveryFee);

  /* The address goes onto the order itself, below, for every delivery order.
     This block is now only about the customer's ADDRESS BOOK — a saved address
     an account can reuse next time — which is why it is still the one thing
     here that a guest does not get: Address rows belong to a user.

     Until the order carried its own copy, this `if (session)` decided whether
     the address survived at all, and a guest's delivery order reached the back
     office with nothing under "משלוח עד הבית". */
  /* Once per place, and only for an order that is real. A gateway order is
     not real yet: it exists so the card form can open, the customer may still
     change the address under it (updatePendingOrderDetailsAction) or walk
     away, and every change to the basket makes a new one. Its address goes
     into the book when Pelecard confirms the payment — see the callback. An
     order on any other lane is final as placed, so it is remembered now.
     rememberAddress reuses an identical address instead of adding it again. */
  let addressId: string | undefined;
  if (keepsAddress && session && data.paymentMethod !== "PELECARD") {
    addressId = await rememberAddress(session.sub, {
      fullName: data.fullName,
      phone: data.phone,
      city: data.city!,
      street: data.street!,
      houseNo: data.houseNo!,
      apartment: data.apartment,
      notes: data.deliveryNotes,
    });
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

  const orderAttribution =
    parseAttribution((await cookies()).get(ATTRIBUTION_COOKIE)?.value) ?? attributionFromJson(cart.attribution);
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
      // Where this customer came from: the browser's record now, or the
      // cart's from when it was made if the cookie has since gone.
      attribution: orderAttribution ?? undefined,
      // The Google Ads click to report this sale against
      // (lib/analytics/google-ads-conversions.ts): the browser's, else the
      // cart's from whichever visit last carried one.
      gclid: gclidOf(orderAttribution) ?? (isRealClickId(cart.gclid) ? cart.gclid : null),
      // The tick beside the phone field. Missing (an older client) means yes,
      // which is what the column defaults to as well.
      // The visit this was placed in, so the path log can be read up to the
      // sale. See lib/pageview.
      visitSid: await currentVisitSid(),
      gaClientId: data.gaClientId ?? null,
      gaSessionId: data.gaSessionId ?? null,
      // Meta Conversions API: consent is never assumed, ids only with it.
      metaConsent: data.metaConsent === true,
      metaFbp: data.metaConsent === true ? (data.metaFbp ?? null) : null,
      metaFbc: data.metaConsent === true ? (data.metaFbc ?? null) : null,
      whatsappOptIn: data.whatsappOptIn ?? true,
      // Consent to advertising is never assumed: missing means no.
      marketingOptIn: data.marketingOptIn === true,
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

  for (const item of summary.items) {
    const product = (await db.product.findUnique({
      where: { id: item.productId },
      select: { sku: true, supplierCost: true },
    }))!;
    await db.orderItem.create({
      data: {
        orderId: order.id,
        productId: item.productId,
        titleSnap: item.title,
        skuSnap: product.sku,
        priceSnap: item.price,
        /* The cost on the day, so the dashboard's profit is the profit this
           order actually made and not one re-read off a later price list. */
        costSnap: product.supplierCost && product.supplierCost > 0 ? product.supplierCost : null,
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

  // The account remembers the latest answer, so the next checkout opens with
  // the box the way this customer last left it.
  if (session?.sub && (data.whatsappOptIn !== undefined || data.marketingOptIn !== undefined)) {
    await db.user
      .update({
        where: { id: session.sub },
        data: {
          ...(data.whatsappOptIn !== undefined ? { whatsappOptIn: data.whatsappOptIn } : {}),
          // The moment of consent is part of the consent: it is what the
          // shop shows if a customer ever asks when they agreed.
          ...(data.marketingOptIn !== undefined
            ? { marketingOptIn: data.marketingOptIn, marketingOptInAt: data.marketingOptIn ? new Date() : null }
            : {}),
        },
      })
      .catch(() => {});
  }

  // A personal wheel coupon is spent by an order that is final as placed; a
  // gateway order spends it when the payment clears (the Pelecard callback).
  if (!payWithPelecard) await retireGameCoupon(summary.couponCode);

  /* A friend's discount is spent once it is on an order: the bar and the
     product-page line that announce it stop here. See lib/referral.ts. */
  if (summary.couponCode?.startsWith(REFERRAL_CODE_PREFIX)) {
    const jar = await cookies();
    jar.delete(REFERRAL_COOKIE);
    jar.delete(REFERRAL_FLAG_COOKIE);
  }

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
  // the club: cashback and level gifts for an order that is paid as placed
  if (!payWithPelecard && paymentStatus === "AUTHORIZED") await awardPurchase(order.id);


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
      /* The payment's state, so the page can say plainly whether the money
         went through — a customer who saw no confirmation (17 November) came
         back and paid again. Status only: no amounts, card or approval data. */
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
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
 * (The next two paragraphs stopped being true when collecting became free:
 * the method now moves the total, and the function re-prices or refuses
 * accordingly. They are kept because they explain why the fields are live.)
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
  },
  /* Set only by the checkout when NO payment form is open for this order: it
     has closed the form and will open a new one, for the new amount, once
     this returns. With a form open the amount is already in Pelecard's hands
     and must not move underneath it. */
  { reprice = false }: { reprice?: boolean } = {},
) {
  const session = await getSession();

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      userId: true,
      status: true,
      paymentStatus: true,
      addressId: true,
      subtotal: true,
      discountTotal: true,
      deliveryMethod: true,
      deliveryFee: true,
      couponCode: true,
    },
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

  /* The address is written to the ORDER — ship*, the copy the back office
     and the courier read (lib/order-address.ts). It used to go only to the
     address-book row the order pointed at, so a customer who corrected their
     street while the card form was open had the order shipped to the street
     they had corrected. The book is not touched here: this runs on every
     pause in typing, and a half-typed street is not an address to keep. The
     callback files the final one in the book once the payment clears. */
  const method = details.deliveryMethod;
  const shipsHome = method ? requiresAddress(method) : null;
  const fullAddress = Boolean(details.city && details.street && details.houseNo);

  /* THE DELIVERY METHOD MOVES THE TOTAL, and the note above this function
     said it did not. It was true when it was written: the charge was read off
     the subtotal alone. Collecting has been free since, so a basket under the
     free-delivery threshold costs 40 ₪ more delivered than collected — and an
     order that followed the form from one to the other kept the first price.
     A collection charged for delivery, or a delivery nobody was charged for.

     So a change of method that changes the charge is refused while a payment
     form is open (the amount is Pelecard's by then), and applied — with the
     order re-priced in the same write — only when the checkout says it has
     closed the form and is about to open a new one. */
  let repriced: { deliveryFee: number; total: number } | null = null;
  if (method && method !== order.deliveryMethod) {
    const fee = deliveryFeeAfterMethodChange(order, method);
    /* "reprice" tells the checkout why: the form on the page is for an amount
       this order no longer has, so it must close it rather than carry on. */
    if (fee === null) return { success: false as const, reason: "reprice" as const };
    if (fee !== order.deliveryFee) {
      if (!reprice) return { success: false as const, reason: "reprice" as const };
      repriced = { deliveryFee: fee, total: Math.max(0, order.subtotal - order.discountTotal + fee) };
    }
  }
  /* A re-priced order is about to be paid for: it must be deliverable. The
     keystroke path below tolerates a half-typed address; this one does not. */
  if (reprice && shipsHome && !fullAddress) return { success: false as const };

  await db.order.update({
    where: { id: order.id },
    data: {
      guestName: details.fullName,
      guestEmail: details.email,
      guestPhone: details.phone,
      customerNote: details.deliveryNotes,
      ...(method ? { deliveryMethod: method } : {}),
      ...(repriced ?? {}),
      ...(shipsHome === false
        ? { shipCity: null, shipStreet: null, shipHouseNo: null, shipApartment: null }
        : fullAddress
          ? {
              shipCity: details.city,
              shipStreet: details.street,
              shipHouseNo: details.houseNo,
              shipApartment: details.apartment || null,
            }
          : {}),
    },
  });

  return { success: true as const };
}
