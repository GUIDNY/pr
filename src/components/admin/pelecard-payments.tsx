import { formatPrice, formatDateTime } from "@/lib/format";

/**
 * Every payment the gateway has answered about, on the live site.
 *
 * This table existed before and nobody could see it: the page returned early
 * whenever the sandbox console was unavailable, and on the live site that is
 * always, by design. So the one screen in the shop that could answer "did this
 * customer's card actually go through" rendered a status box, a list of stuck
 * orders, and nothing else — on the only deployment where the question is ever
 * asked. The console stays gated; this does not.
 *
 * What it has to answer, in the order the questions actually get asked on the
 * phone with a customer standing at the other end:
 *
 *   did it go through      → the status, and Pelecard's own code beside it
 *   on which card          → the card's Hebrew name and its last four digits
 *   what is the reference  → the approval number, which is what a customer's
 *                            credit card company asks for
 *   and if not, why not    → Pelecard's own ErrorMessage, verbatim
 *
 * That last one is the reason this is worth building rather than linking to
 * Pelecard's own back office. "3DS process failed" told us in one line that a
 * customer who was sure she had paid had not, and that nothing needed
 * refunding — and it was sitting in a column of JSON nobody could reach.
 *
 * Nothing here is interpreted. The code, the message and the approval number
 * are printed as they arrive; a status code table written from memory is how a
 * screen like this starts lying.
 */

type PaymentRow = {
  id: string;
  createdAt: Date;
  amount: number;
  status: string;
  pelecardStatusCode: string | null;
  pelecardTransactionId: string | null;
  rawResponse: unknown;
  order: { orderNumber: string; status: string; paymentStatus: string };
};

/**
 * Pelecard's answer, read defensively.
 *
 * Three shapes are in this column and all three are live. A gateway answer has
 * `feedback.ResultData` and everything below comes out of it. A failure has the
 * same shape with the detail fields blank and `ErrorMessage` carrying the whole
 * story. And a row can have `manual` instead of any of it: an order settled
 * away from the gateway — a card read out over the phone — written straight
 * into the column. There is no code in this repo that writes that shape, so it
 * is read rather than relied on, and a row carrying it is labelled as what it
 * is instead of rendering as a line of dashes that looks like a bug.
 */
function readFeedback(raw: unknown) {
  const root = raw as Record<string, unknown> | null;
  const feedback = (root?.feedback ?? null) as Record<string, unknown> | null;
  const result = (feedback?.ResultData ?? null) as Record<string, unknown> | null;
  const manual = (root?.manual ?? null) as Record<string, unknown> | null;
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);

  const pan = text(result?.CreditCardNumber);
  return {
    /* "operation success" comes back on the good ones too, so it is only shown
       where it is actually news. */
    error: text(feedback?.ErrorMessage),
    cardName: text(result?.CardHebrewName) ?? text(result?.CardEnName),
    lastFour: pan && pan.length >= 4 ? pan.slice(-4) : null,
    approval: text(result?.DebitApproveNumber) ?? text(result?.AuthManpikNo) ?? text(feedback?.ApprovalNo),
    payments: text(result?.TotalPayments),
    holder: text(result?.CardHolderName),
    manual: manual ? { method: text(manual.method), at: text(manual.at) } : null,
  };
}

const STATUS_STYLE: Record<string, string> = {
  CAPTURED: "bg-success/15 text-success-foreground border-success/40",
  AUTHORIZED: "bg-success/15 text-success-foreground border-success/40",
  PENDING: "bg-warning/15 border-warning/40",
  FAILED: "bg-destructive/15 border-destructive/40",
  REFUNDED: "bg-muted border-border",
};

export function PelecardPayments({ payments }: { payments: PaymentRow[] }) {
  return (
    <div className="border-border bg-card rounded-xl border p-5">
      <h2 className="mb-1 font-semibold">התשלומים האחרונים</h2>
      <p className="text-muted-foreground mb-4 text-sm">
        כל תשובה שחזרה מפלאקארד, כפי שהיא. סכום, כרטיס, מספר אישור — ובעסקה שנכשלה, הסיבה במילים שלהם.
      </p>

      {payments.length === 0 ? (
        <p className="text-muted-foreground text-sm">עוד לא נרשמה אף עסקה.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b text-start text-xs">
              <tr>
                <th className="py-2 text-start">מתי</th>
                <th className="py-2 text-start">הזמנה</th>
                <th className="py-2 text-start">סכום</th>
                <th className="py-2 text-start">סטטוס</th>
                <th className="py-2 text-start">כרטיס</th>
                <th className="py-2 text-start">מספר אישור</th>
                <th className="py-2 text-start">תשובת פלאקארד</th>
              </tr>
            </thead>
            <tbody className="divide-border divide-y">
              {payments.map((payment) => {
                const info = readFeedback(payment.rawResponse);
                const failed = payment.status === "FAILED";
                return (
                  <tr key={payment.id} className="align-top">
                    <td className="text-muted-foreground py-2 text-xs whitespace-nowrap">
                      {formatDateTime(payment.createdAt)}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <span className="font-semibold">{payment.order.orderNumber}</span>
                      <span className="text-muted-foreground block text-xs">{payment.order.status}</span>
                    </td>
                    <td className="py-2 tabular-nums whitespace-nowrap">
                      {formatPrice(payment.amount)}
                      {info.payments && info.payments !== "1" && (
                        <span className="text-muted-foreground block text-xs">{info.payments} תשלומים</span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded-md border px-1.5 py-0.5 text-xs font-medium ${
                          STATUS_STYLE[payment.status] ?? "bg-muted border-border"
                        }`}
                      >
                        {payment.status}
                      </span>
                      {payment.pelecardStatusCode && (
                        <span className="text-muted-foreground block font-mono text-xs" dir="ltr">
                          {payment.pelecardStatusCode}
                        </span>
                      )}
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {info.manual ? (
                        <span className="text-muted-foreground text-xs">
                          סומן ידנית
                          {info.manual.method && <span className="block font-mono">{info.manual.method}</span>}
                        </span>
                      ) : (
                        (info.cardName ?? "—")
                      )}
                      {info.lastFour && (
                        <span className="text-muted-foreground block font-mono text-xs" dir="ltr">
                          •••• {info.lastFour}
                        </span>
                      )}
                      {info.holder && <span className="text-muted-foreground block text-xs">{info.holder}</span>}
                    </td>
                    <td className="py-2 font-mono text-xs whitespace-nowrap" dir="ltr">
                      {info.approval ?? "—"}
                    </td>
                    <td className="py-2">
                      {/* The failure reason is the whole point of the row, so it
                          is printed rather than folded away. On a payment that
                          worked their message is "operation success", which is
                          not news, and the raw answer is one click down. */}
                      {failed && info.error && (
                        <p className="text-destructive mb-1 max-w-sm text-xs" dir="ltr">
                          {info.error}
                        </p>
                      )}
                      {info.manual && (
                        <p className="text-muted-foreground mb-1 text-xs">
                          שולם מחוץ לסליקה — אין תשובה מפלאקארד על העסקה הזו.
                        </p>
                      )}
                      {payment.rawResponse ? (
                        <details>
                          <summary className="text-brand cursor-pointer text-xs">התשובה המלאה</summary>
                          <pre
                            dir="ltr"
                            className="bg-muted mt-1 max-h-72 max-w-lg overflow-auto rounded-md p-2 text-[0.65rem] leading-tight"
                          >
                            {JSON.stringify(payment.rawResponse, null, 2)}
                          </pre>
                          {payment.pelecardTransactionId && (
                            <p className="text-muted-foreground mt-1 font-mono text-[0.65rem]" dir="ltr">
                              {payment.pelecardTransactionId}
                            </p>
                          )}
                        </details>
                      ) : (
                        <span className="text-muted-foreground text-xs">אין תשובה — ראו למעלה</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
