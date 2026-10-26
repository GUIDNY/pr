import { z } from "zod";
import { DELIVERY_METHODS } from "./enums";
import { manualPaymentMethodSchema } from "./enums";
import { requiresAddress } from "./delivery";

/**
 * An order typed into the back office, for a sale that did not happen on
 * the site.
 *
 * The shop sells on the phone and on WhatsApp, and until now those sales
 * existed nowhere: no order row, so no profit line, no status to work
 * through, no record of what was promised to whom. The checkout cannot be
 * used for them — it starts from a cart in somebody's browser — so this is
 * the second door into the same table.
 *
 * Everything below is the part that can be decided without a database, so
 * that it can be tested without one. See actions/admin-manual-order.ts for
 * the half that writes.
 *
 * THREE DECISIONS WORTH KNOWING, because each of them is a rule from
 * somewhere else in this codebase being deliberately honoured or
 * deliberately not:
 *
 * 1. **The price is typed in, and may be below cost.** Every other price
 *    in this shop is the price list's — "nothing is priced by hand any more
 *    except Ninja" — but that rule is about what the *site* shows, and this
 *    is a salesperson repeating what they just agreed on the phone. A form
 *    that refused the agreed number would be a form nobody could use for
 *    the call they are on. The margin is shown per line and in total
 *    instead, and goes red when it is negative, so the figure is in front
 *    of the person before they save rather than in a report afterwards.
 *
 * 2. **Stock is not decremented.** `stockQty` belongs to the sync, which
 *    reads it off the supplier's sheet twice a day — see the field
 *    ownership table. Writing it here would be undone by the next run, and
 *    the undoing would look like a bug in the sync.
 *
 * 3. **Nothing is sent to the customer.** The owner asked on 26 October
 *    that nothing reach a customer because somebody pressed a button in the
 *    back office — only because they pressed SEND. Creating an order is a
 *    button. The notifications panel on the order page is the one path out.
 */

export const MANUAL_ORDER_MAX_LINES = 20;
export const MANUAL_ORDER_MAX_QTY = 99;
/** Well past the most expensive thing in the catalogue, and short of a
    typo that adds a digit by accident. */
export const MANUAL_ORDER_MAX_UNIT_PRICE = 200_000;

/** Money, to the agora. Float columns and repeated addition do not mix. */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export const manualOrderLineSchema = z.object({
  productId: z.string().min(1, "חסר מוצר"),
  quantity: z.number().int().min(1).max(MANUAL_ORDER_MAX_QTY),
  /** What was agreed, per unit. Defaults to the product's price in the
      form; zero is allowed, for a replacement or a goodwill item. */
  unitPrice: z.number().min(0).max(MANUAL_ORDER_MAX_UNIT_PRICE),
});

export type ManualOrderLine = z.infer<typeof manualOrderLineSchema>;

const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));

export const manualOrderSchema = z
  .object({
    lines: z.array(manualOrderLineSchema).min(1, "צריך לפחות פריט אחד").max(MANUAL_ORDER_MAX_LINES),
    customerName: z.string().trim().min(2, "צריך שם לקוח").max(80),
    /* Deliberately not a format. Israeli numbers arrive as 054-123-4567,
       +972…, with spaces, and a manual order is typed while somebody is on
       the line — a rejected form at that moment loses the order, and a
       number that needs tidying is a smaller problem than one that was
       never written down. */
    customerPhone: z.string().trim().min(9, "צריך טלפון").max(20),
    customerEmail: z.union([z.string().trim().email("אימייל לא תקין").max(120), z.literal("")]).optional(),
    deliveryMethod: z.enum(DELIVERY_METHODS),
    city: optionalText(80),
    street: optionalText(120),
    houseNo: optionalText(20),
    apartment: optionalText(20),
    /** What the customer is charged for delivery. Income. */
    deliveryFee: z.number().min(0).max(10_000),
    /** What it costs the shop, if it is already known. The order page can
        also be filled in later — see Order.deliveryCost. */
    deliveryCost: z.number().min(0).max(10_000).nullable().optional(),
    customerNote: optionalText(500),
    /** Has the money already been taken? */
    paid: z.boolean(),
    paymentMethod: manualPaymentMethodSchema.optional(),
    paymentReference: optionalText(80),
  })
  .superRefine((value, ctx) => {
    /* An address for the door and for a pickup point both — the carrier
       arranges the point with the customer and still needs to know roughly
       where they are. Only collecting from our own counter needs none.
       Same rule as the checkout's, read from the same function. */
    if (requiresAddress(value.deliveryMethod)) {
      for (const [field, label] of [
        ["city", "עיר"],
        ["street", "רחוב"],
        ["houseNo", "מספר בית"],
      ] as const) {
        if (!value[field]) {
          ctx.addIssue({ code: "custom", path: [field], message: `צריך ${label} למשלוח` });
        }
      }
    }
    /* "Paid" with no method is a row that says money arrived and cannot say
       how, which is the one thing a payment record exists to answer. */
    if (value.paid && !value.paymentMethod) {
      ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "צריך לבחור איך הלקוח שילם" });
    }
  });

export type ManualOrderInput = z.infer<typeof manualOrderSchema>;

/**
 * What the order comes to, and what it makes.
 *
 * `cost` is null — not zero — when any line has no cost on record, and the
 * margin is null with it. A profit figure computed over a missing cost
 * reads as a large profit, which is the most expensive possible way to be
 * wrong about this number. The order page already draws this distinction
 * for the delivery cost ("before delivery" until it is filled in); this is
 * the same distinction one step earlier.
 */
export function manualOrderTotals(
  lines: { quantity: number; unitPrice: number; unitCost?: number | null }[],
  deliveryFee: number,
  deliveryCost?: number | null,
): {
  subtotal: number;
  total: number;
  cost: number | null;
  margin: number | null;
  marginPct: number | null;
} {
  const subtotal = round2(lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0));
  const total = round2(subtotal + deliveryFee);

  const anyMissing = lines.some((l) => l.unitCost === null || l.unitCost === undefined);
  const goodsCost = anyMissing
    ? null
    : round2(lines.reduce((sum, l) => sum + (l.unitCost as number) * l.quantity, 0));

  /* The delivery cost is a separate unknown and is treated as one: an order
     whose goods cost is known but whose courier bill is not still has a
     meaningful margin, measured before delivery. Only a missing GOODS cost
     makes the whole figure unanswerable. */
  const cost = goodsCost === null ? null : round2(goodsCost + (deliveryCost ?? 0));
  const margin = cost === null ? null : round2(total - cost);
  const marginPct = margin === null || total <= 0 ? null : Math.round((margin / total) * 100);

  return { subtotal, total, cost, margin, marginPct };
}

/** Where an order typed in the back office came from, in the shape the
    attribution panel already reads. Not a channel, and never left blank:
    an empty source is indistinguishable from one nobody captured. */
export function manualOrderAttribution(now = new Date()) {
  return {
    first: { source: "back-office", medium: "manual", at: now.toISOString() },
  };
}
