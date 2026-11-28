import { BUSINESS_DAY_NAMES, DELIVERY_ZONES, HANDLING_DAYS, deliveryPromiseFor, type DeliveryMethod } from "@/lib/delivery";

/**
 * The latest day an order should be in the customer's hands, as a calendar
 * date — "YYYY-MM-DD" in Israel. Google Customer Reviews needs exactly this:
 * it sends its survey after the date, so a date that is too early asks a
 * customer to rate a delivery that has not happened yet.
 *
 * Built from the same promise every page states (delivery.ts), never a second
 * number: the national maximum for anything carried to an address or a
 * collection point, the handling time for a counter pickup. Counted in the
 * business days BUSINESS_DAY_NAMES names (Sunday to Thursday). Holidays are not
 * known here, so the date can land a day or two early around one — the cost
 * is a survey that arrives a little soon, never a promise to the customer.
 */
const BUSINESS_DAYS = new Set(BUSINESS_DAY_NAMES.map((_, i) => i)); // 0 = Sunday … 4 = Thursday

/** How many business days this order is promised to take. */
export function promisedBusinessDays(
  method: DeliveryMethod | string,
  products: { deliveryDays: number }[],
): number {
  if (method === "PICKUP") return HANDLING_DAYS.max;
  const longest = products.reduce((max, p) => Math.max(max, deliveryPromiseFor(p).max), 0);
  return longest || DELIVERY_ZONES.national.max;
}

/** The Israeli calendar date of `from`, plus `businessDays` business days. */
export function addBusinessDaysIL(from: Date, businessDays: number): string {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(from)
    .split("-")
    .map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  // An order placed on a Friday or Saturday starts counting on Sunday.
  while (!BUSINESS_DAYS.has(day.getUTCDay())) day.setUTCDate(day.getUTCDate() + 1);
  let left = businessDays;
  while (left > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (BUSINESS_DAYS.has(day.getUTCDay())) left--;
  }
  return day.toISOString().slice(0, 10);
}

export function estimatedDeliveryDate(
  placedAt: Date,
  method: DeliveryMethod | string,
  products: { deliveryDays: number }[],
): string {
  return addBusinessDaysIL(placedAt, promisedBusinessDays(method, products));
}
