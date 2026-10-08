import "server-only";
import { db } from "@/lib/db";
import { rememberAddress } from "@/lib/address-book";
import { retireGameCoupon } from "@/lib/game-wheel";
import { awardPurchase } from "@/lib/game-levels";
import { notifyOrder } from "@/lib/notify";
import { notifyOwnerOfNewOrder } from "@/lib/notify/owner-alert";

/**
 * What happens once an order's money is real, whichever way it arrived.
 *
 * Lifted out of the Pelecard callback, word for word, when a second way to
 * pay appeared — the BuyToday balance (lib/wallet.ts). Two copies of this
 * list is how a balance-paid order ends up with no confirmation mail, or a
 * wheel coupon that can be used twice, and nobody notices until a customer
 * does. The caller has already written the order paid, in its own
 * transaction; this is everything after that, and none of it may undo it.
 */
export async function afterOrderPaid(order: {
  id: string;
  userId: string | null;
  couponCode: string | null;
  deliveryMethod: string;
}): Promise<void> {
  // A personal coupon from the mall's wheel is good for one paid order.
  await retireGameCoupon(order.couponCode);
  // the club: cashback on this order, and any level gift it reaches
  await awardPurchase(order.id);

  /* The payment is real, so the address it was paid for goes into the
     account's address book now, once (rememberAddress reuses an identical
     one). Taken from the order's own copy, which is the address the customer
     finished with. Never allowed to fail the callback: a book entry is a
     convenience, the payment record is not. */
  if (order.userId && order.deliveryMethod === "DELIVERY") {
    try {
      const shipped = await db.order.findUnique({
        where: { id: order.id },
        select: { shipCity: true, shipStreet: true, shipHouseNo: true, shipApartment: true, guestName: true, guestPhone: true, customerNote: true },
      });
      if (shipped?.shipCity && shipped.shipStreet && shipped.shipHouseNo) {
        const addressId = await rememberAddress(order.userId, {
          fullName: shipped.guestName ?? "",
          phone: shipped.guestPhone ?? "",
          city: shipped.shipCity,
          street: shipped.shipStreet,
          houseNo: shipped.shipHouseNo,
          apartment: shipped.shipApartment,
          notes: shipped.customerNote,
        });
        await db.order.update({ where: { id: order.id }, data: { addressId } });
      }
    } catch (error) {
      console.error("[order-paid] could not file the address", error);
    }
  }

  /* Both mails go out here rather than at order creation, because on this
     lane the order exists before the customer has paid: it is created, the
     customer is sent to the gateway, and plenty of them never come back.
     Alerting on that would fill the shop's inbox with abandoned carts and
     tell a customer their order was received when it was not. The card
     clearing is the moment the order is real. */
  await notifyOrder(order.id, "ORDER_RECEIVED");
  await notifyOwnerOfNewOrder(order.id);
}
