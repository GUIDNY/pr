/**
 * Where an order is going.
 *
 * There are two places an address can sit on an order and that is exactly how a
 * rule like this rots, so every screen asks here instead of reaching for one of
 * them directly:
 *
 *   - `ship*` on the order — the record of where THIS order was sent, written
 *     at checkout for every delivery order. This is the answer.
 *   - `address` — a row in the account's address book. Kept only as a fallback
 *     for orders placed before the order carried its own copy (those were
 *     backfilled, so this should never fire; it costs nothing and means no
 *     order can lose its address if a backfill is ever missed).
 *
 * A guest never had an address-book row to point at — `Address.userId` is
 * required — which is why a guest's delivery order used to arrive at the back
 * office with nothing under "משלוח עד הבית".
 */

export type OrderShipping = {
  city: string;
  street: string;
  houseNo: string;
  apartment?: string | null;
};

type AddressCarrier = {
  deliveryMethod: string;
  shipCity?: string | null;
  shipStreet?: string | null;
  shipHouseNo?: string | null;
  shipApartment?: string | null;
  address?: { city: string; street: string; houseNo: string; apartment: string | null } | null;
};

export function orderShippingAddress(order: AddressCarrier): OrderShipping | null {
  if (order.deliveryMethod !== "DELIVERY") return null;

  if (order.shipCity && order.shipStreet) {
    return {
      city: order.shipCity,
      street: order.shipStreet,
      houseNo: order.shipHouseNo ?? "",
      apartment: order.shipApartment,
    };
  }

  if (order.address) {
    const { city, street, houseNo, apartment } = order.address;
    return { city, street, houseNo, apartment };
  }

  return null;
}

/** One line, the way it is read out to a courier. */
export function formatShippingAddress(shipping: OrderShipping): string {
  const street = [shipping.street, shipping.houseNo].filter(Boolean).join(" ");
  const parts = [shipping.city, street];
  if (shipping.apartment) parts.push(`דירה ${shipping.apartment}`);
  return parts.filter(Boolean).join(", ");
}
