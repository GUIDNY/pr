/**
 * Whether a new card form may be opened while an earlier one may still be
 * paying. Pure, so scripts/check-prior-payment.ts carries every case.
 *
 * The danger it closes: the callback treats a success on an already-paid
 * order as a no-op, so a second form opened for the same order — or the same
 * visit — while the first was being paid authorises the card twice and leaves
 * one record. And a callback that is a little late makes a paid form look
 * unpaid at exactly the moment the customer comes back to try again
 * (17 November: authorised at 22:21, a new form at 22:34).
 *
 * So before a new form opens, every recent unfinished form is asked about with
 * ValidateByUniqueKey — the read the callback already uses, which answered the
 * number 1 on all 21 real successful payments recorded so far:
 *
 *   1                       → that form was paid. Open nothing; send the
 *                             customer to that order's confirmation.
 *   an explicit 0 / refusal → not paid. Allow, unless that form was opened in
 *                             the last few minutes AND the customer typed in
 *                             it (it may still be inside 3D Secure) — wait.
 *   anything else, an error → unknown. Wait: "המתינו דקה או התקשרו".
 *
 * Only forms opened in the last PRIOR_WINDOW_MS are asked about at all; an
 * older one is not still in progress.
 */
export const PRIOR_WINDOW_MS = 15 * 60_000;
export const STILL_PAYING_MS = 3 * 60_000;

export type PriorVerdict = "PAID" | "WAIT" | "ALLOW";

/** ValidateByUniqueKey's answer, read conservatively: only 1 is "paid". */
export function readValidation(validation: unknown): "PAID" | "REFUSED" | "UNKNOWN" {
  if (validation === 1 || validation === "1" || validation === true) return "PAID";
  if (validation === 0 || validation === "0" || validation === false) return "REFUSED";
  if (typeof validation === "object" && validation !== null) {
    const record = validation as Record<string, unknown>;
    for (const key of ["Result", "result", "Status", "status", "ResultCode", "Value"]) {
      const v = record[key];
      if (v === 1 || v === "1") return "PAID";
      if (v === 0 || v === "0") return "REFUSED";
    }
    const error = record.Error as { ErrCode?: unknown } | undefined;
    if (error && error.ErrCode !== undefined && String(error.ErrCode) !== "0") return "REFUSED";
  }
  return "UNKNOWN";
}

/** The verdict for one earlier form. `answer` is null when the call failed.
    `touched` is whether the customer put the cursor in that card form
    (payment_form_touch): a form closed by "לשנות את פרטי ההזמנה" without
    being touched is reopened at once, never made to wait. */
export function verdictFor(
  answer: "PAID" | "REFUSED" | "UNKNOWN" | null,
  openedAt: Date,
  now: Date,
  touched: boolean,
): PriorVerdict {
  if (answer === "PAID") return "PAID";
  if (answer === "REFUSED") return touched && now.getTime() - openedAt.getTime() < STILL_PAYING_MS ? "WAIT" : "ALLOW";
  return "WAIT";
}

/** Several earlier forms: any paid wins, then any wait, else allow. */
export function combine(verdicts: PriorVerdict[]): PriorVerdict {
  if (verdicts.includes("PAID")) return "PAID";
  if (verdicts.includes("WAIT")) return "WAIT";
  return "ALLOW";
}
