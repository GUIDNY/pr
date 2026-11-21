/**
 * Telling a payment page that ran out of time from a charge that may have
 * gone through.
 *
 * Pelecard report both as status 301, and the checkout treated every 301 as
 * the dangerous one: "the charge may have gone through, contact us before
 * trying again", and no retry button — because retrying a charge whose answer
 * was lost is how a customer is billed twice.
 *
 * A customer who opens the payment form, leaves it for ten minutes and comes
 * back lands on exactly that screen. Nothing has been
 * charged and nothing could have been: the notification reads "Session to
 * Pelecard Timed Out" and carries no transaction id, because the form expired
 * before a card was ever submitted. They are told their money might be gone
 * and given nowhere to go.
 *
 * The two are distinguishable by what the notification carries, not by the
 * code. A transaction that reached the clearing company has an id; a form
 * that expired has none, and says so in its own words. Both signs are
 * required — an id with no message, or a message beside an id, stays on the
 * careful side.
 */
export function paymentPageExpired(payment: {
  statusCode: string | null | undefined;
  transactionId: string | null | undefined;
  errorMessage: string | null | undefined;
}): boolean {
  if (payment.statusCode !== "301") return false;
  if (payment.transactionId) return false;
  return /session\b.*\btimed?\s*out/i.test(payment.errorMessage ?? "");
}

export const PAYMENT_PAGE_EXPIRED_MESSAGE =
  "דף התשלום נסגר אחרי כמה דקות בלי פעילות, לפני שהוזן כרטיס. לא בוצע חיוב, ואפשר לנסות שוב.";

/** The gateway's own wording for a failure, out of the exchange kept on the
    payment. Read defensively: the column is free-form JSON. */
export function gatewayErrorMessage(rawResponse: unknown): string | null {
  if (!rawResponse || typeof rawResponse !== "object") return null;
  const feedback = (rawResponse as { feedback?: unknown }).feedback;
  if (!feedback || typeof feedback !== "object") return null;
  const message = (feedback as { ErrorMessage?: unknown }).ErrorMessage;
  return typeof message === "string" ? message : null;
}

/**
 * Whether a 650 (3D Secure did not complete) was the card issuer saying no,
 * rather than a check the customer simply did not finish.
 *
 * The 650 message says "the card is fine, try again and approve the message
 * we send you" — right when the SMS never arrived or the app timed out. It is
 * wrong when the issuer rejected the authentication outright (EMV 3DS
 * transStatus "R", e.g. reason 11 "suspected fraud"): the same card is refused
 * again a minute later. On 21 November a customer met exactly that at four in
 * the morning, retried twice in seconds on our advice, and left.
 *
 * Pelecard put the result in ResultData.Auth3DSTranStatus. We keep the
 * exchange either as a parsed `feedback` object or, on the error-feedback
 * path, as the raw `rawBody` string — read both, defensively.
 */
export function issuerRejected3DS(rawResponse: unknown): boolean {
  if (!rawResponse || typeof rawResponse !== "object") return false;
  const status = (source: unknown): unknown => {
    if (!source || typeof source !== "object") return undefined;
    const resultData = (source as { ResultData?: unknown }).ResultData;
    if (!resultData || typeof resultData !== "object") return undefined;
    return (resultData as { Auth3DSTranStatus?: unknown }).Auth3DSTranStatus;
  };
  const fromFeedback = status((rawResponse as { feedback?: unknown }).feedback);
  if (fromFeedback !== undefined) return fromFeedback === "R";
  const rawBody = (rawResponse as { rawBody?: unknown }).rawBody;
  if (typeof rawBody !== "string") return false;
  try {
    return status(JSON.parse(rawBody)) === "R";
  } catch {
    return false;
  }
}

export const ISSUER_REJECTED_3DS_MESSAGE =
  "חברת האשראי שהנפיקה את הכרטיס לא אישרה את העסקה בשלב האימות. זה לא קרה בגלל משהו באתר, ולא בוצע חיוב. אפשר לנסות כרטיס אחר, או להתקשר לחברת האשראי, לאשר את העסקה ולנסות שוב.";
