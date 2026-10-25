/**
 * What an order actually made, as far as the shop can know from its own rows.
 *
 * The dashboard already had this rule and it is kept here rather than
 * reinvented — see profitWindow in lib/queries/admin.ts. What the goods sold
 * for, minus the discount given, minus what those goods cost us on the day.
 * Always from the snapshots on the order line, never from today's catalogue:
 * the price list moves twice a day and a margin read off it would quietly
 * rewrite last month's orders.
 *
 * ONE LINE IS NEW HERE, and it is the reason this exists at the order level
 * at all: delivery. The dashboard leaves both halves out, on the grounds that
 * the fee is a pass-through — true in aggregate and false for the order in
 * front of you, where a customer paid ₪0 for delivery and the carrier charged
 * ₪120. There is no carrier integration to read the real figure from, so it is
 * typed in by hand, and until it is typed in this says so instead of guessing
 * at it.
 *
 * WHAT IS NOT IN THE NUMBER, because a profit figure that quietly omits things
 * is worse than one that admits to them: the clearing fee Pelecard takes, VAT
 * on the margin, and anything else that is not on the order. The panel that
 * renders this says the same out loud.
 *
 * A LINE WITH NO COST IS NOT A FREE LINE. Product.supplierCost is empty for
 * part of the catalogue, so costSnap can be null on a perfectly ordinary
 * order. Counting it as zero turns a missing figure into a margin of 100% and
 * nothing on the screen would say otherwise. Those lines are counted and
 * reported, and the profit they appear in is an upper bound — `certain` is
 * false and the caller has to render it as "at most".
 */

export type ProfitLine = {
  priceSnap: number;
  costSnap: number | null;
  quantity: number;
};

export type OrderProfit = {
  /** What the goods sold for, before the discount. */
  revenue: number;
  discount: number;
  /** What the customer paid for delivery. Income. */
  deliveryIncome: number;
  /** What those goods cost us, over the lines that have a cost. */
  goodsCost: number;
  /** What the delivery cost us. Null until somebody enters it. */
  deliveryCost: number | null;
  /** Lines whose product had no cost on record. */
  linesMissingCost: number;
  /** revenue − discount + deliveryIncome − goodsCost − deliveryCost */
  profit: number;
  /** Profit over revenue, or null when there is no revenue to divide by. */
  margin: number | null;
  /** False when something is missing, which makes `profit` an upper bound. */
  certain: boolean;
};

export function orderProfit(input: {
  lines: ProfitLine[];
  discount: number;
  deliveryIncome: number;
  deliveryCost: number | null;
}): OrderProfit {
  let revenue = 0;
  let goodsCost = 0;
  let linesMissingCost = 0;

  for (const line of input.lines) {
    revenue += line.priceSnap * line.quantity;
    if (line.costSnap === null) linesMissingCost += 1;
    else goodsCost += line.costSnap * line.quantity;
  }

  const profit =
    revenue - input.discount + input.deliveryIncome - goodsCost - (input.deliveryCost ?? 0);

  return {
    revenue,
    discount: input.discount,
    deliveryIncome: input.deliveryIncome,
    goodsCost,
    deliveryCost: input.deliveryCost,
    linesMissingCost,
    profit,
    /* Over revenue rather than over the total: the question a shopkeeper is
       asking is what share of the sale was margin. */
    margin: revenue > 0 ? profit / revenue : null,
    certain: linesMissingCost === 0 && input.deliveryCost !== null,
  };
}
