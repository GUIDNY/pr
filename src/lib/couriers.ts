/**
 * The courier companies this shop actually uses, and where their systems are.
 *
 * A list in code rather than a table, because it changes about twice a year
 * and a settings screen for two rows is a settings screen nobody remembers
 * exists. Editing this file is the interface; adding one is three lines and
 * a deploy.
 *
 * `track` is a pattern with {n} where the consignment number goes, and it is
 * optional on purpose. A courier that publishes no per-parcel page gets a
 * site link and nothing else — inventing a URL shape for them would produce
 * a 404 in front of a customer who is already wondering where their order
 * is, which is worse than the honest absence.
 */
export type Courier = {
  id: string;
  name: string;
  /** Where staff go to book a pickup or chase a parcel. */
  site: string;
  phone?: string;
  /** Public tracking page, {n} replaced by the consignment number. */
  track?: string;
};

export const COURIERS: Courier[] = [
  {
    id: "hfd",
    name: "HFD (חץ)",
    site: "https://hfd.co.il",
    phone: "*3060",
    track: "https://hfd.co.il/tracking?awb={n}",
  },
  {
    id: "baldar",
    name: "בלדר אקספרס",
    site: "https://www.baldar.co.il",
  },
  {
    id: "israel-post",
    name: "דואר ישראל",
    site: "https://www.israelpost.co.il",
    phone: "171",
    track: "https://mypost.israelpost.co.il/itemtrace?itemcode={n}",
  },
  {
    id: "chita",
    name: "צ׳יטה שליחויות",
    site: "https://www.cheetah.co.il",
  },
];

/**
 * Our own driver, which is not a courier and deliberately not in the list above.
 *
 * A delivery we make ourselves has no consignment number and no carrier
 * system behind it, so there is nothing to track and no page to send anybody
 * to. It is stored in `Order.courierName` as this exact string, and that is
 * what the shipped notification keys on: it tells the customer the order has
 * left and that we will call to arrange handover, instead of a tracking line
 * that would lead nowhere.
 *
 * A string rather than a column because `courierName` already answers "who
 * is carrying this", and a boolean beside it is a second answer to the same
 * question — the kind that eventually disagrees with the first.
 */
export const INTERNAL_DELIVERY_NAME = "משלוח פנימי";

/** True when the order is going out with our own driver rather than a courier. */
export function isInternalDelivery(courierName: string | null | undefined): boolean {
  return (courierName ?? "").trim() === INTERNAL_DELIVERY_NAME;
}

/** The tracking link for a consignment, or null when the courier publishes none. */
export function courierTrackingUrl(courierName: string | null, number: string | null): string | null {
  if (!courierName || !number) return null;
  if (isInternalDelivery(courierName)) return null;
  const courier = COURIERS.find(
    (c) => c.name === courierName || courierName.includes(c.name) || c.name.includes(courierName),
  );
  if (!courier?.track) return null;
  return courier.track.replace("{n}", encodeURIComponent(number.trim()));
}
