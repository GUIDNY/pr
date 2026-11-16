/**
 * Which of an order's payment forms a Pelecard notification is about.
 *
 * An order can have more than one. A form is opened again whenever the
 * checkout needs a new amount or a fresh session — the delivery method
 * changed, an earlier one would not open, or it was renewed before it could
 * time out — and each opening is its own Payment row with its own
 * ConfirmationKey. Pelecard keeps the earlier sessions alive on their side
 * and reports every one of them when it expires, ten minutes after it opened.
 *
 * The callback used to take "the order's latest payment" as the subject of
 * whatever arrived. So the expiry of a form the customer had already been
 * moved off landed on the form they were typing a card into: that row was
 * marked FAILED, the order moved to PAYMENT_FAILED, and the owner was told a
 * payment had been refused — while the payment was still in progress.
 *
 * Every notification carries the ConfirmationKey of the session it is about
 * (23 of 23 in the record, expiries included), so the subject is looked up
 * rather than assumed. `superseded` says the notification is about a form
 * that is no longer the order's current one.
 */
export type MatchablePayment = { id: string; confirmationKey: string | null };

export function paymentForFeedback<P extends MatchablePayment>(
  /** The order's Pelecard payments, newest first. */
  payments: P[],
  feedbackConfirmationKey: string | null | undefined,
): { payment: P; superseded: boolean } | null {
  const latest = payments[0];
  if (!latest) return null;
  const key = feedbackConfirmationKey?.trim();
  /* No key to go by, or one we never issued: the old behaviour, which is the
     only thing that can be said about a notification that does not name its
     session. */
  if (!key) return { payment: latest, superseded: false };
  const named = payments.find((p) => p.confirmationKey === key);
  if (!named) return { payment: latest, superseded: false };
  return { payment: named, superseded: named.id !== latest.id };
}
