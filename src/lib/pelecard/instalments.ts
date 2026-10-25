/**
 * How many payments the customer may split an order into.
 *
 * Pelecard's form has no instalments *tab* — the number of payments is a field
 * on the card form, and their manual says exactly when it appears:
 *
 *   "MinPayments — כמות התשלומים המינימלית. 1 ברירת מחדל.
 *    אם מספר התשלומים המינימלי והמקסימלי הם 1 לא יוצג השדה."
 *
 * So the field was missing because we were asking for one payment. Their own
 * default for MaxPayments is 12; ours was 1, with a comment saying "until
 * there is an instalments agreement with Pelecard".
 *
 * THE TABLE BELOW IS A BUSINESS DECISION AND IT IS MEANT TO BE EDITED. It is
 * the ordinary shape for an appliance shop — nobody splits a ₪290 toaster into
 * twelve — and it is here rather than inline so that changing it is changing
 * four numbers in one place, not reading a payment flow.
 *
 * What it deliberately does NOT do is touch MinPaymentsForCredit. That is the
 * number of payments at which a transaction becomes a credit deal — one the
 * customer pays interest on — and it is set on the terminal, by the agreement
 * the shop actually signed with its acquirer. Overriding a contract from a
 * stylesheet's neighbour in the repo is not this file's business. If the
 * agreement makes, say, four payments a credit deal and the shop would rather
 * not offer those, the fix is to lower the numbers here.
 */

/** Order total in shekels → the most payments its form will offer. */
export function maxPaymentsFor(totalShekels: number): number {
  if (!Number.isFinite(totalShekels) || totalShekels < 300) return 1;
  if (totalShekels < 1000) return 3;
  if (totalShekels < 3000) return 6;
  return 12;
}

/** True when the form will show the field at all — their rule, not ours. */
export function instalmentsOffered(totalShekels: number): boolean {
  return maxPaymentsFor(totalShekels) > 1;
}
