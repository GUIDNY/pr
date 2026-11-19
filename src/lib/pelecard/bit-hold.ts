/**
 * A held payment that was made with bit, not with a card.
 *
 * PR-577373, 9 November: the customer paid 1,079 ₪ with bit inside
 * Pelecard's form (RecordSource 104, "Gama Bit", GamaLastStatus
 * "approved_temporary"). On 18 November the owner pressed "אשר תשלום וגבה"
 * and Pelecard answered 510 — Record not found.
 *
 * The button sends /services/CompleteDebitByUid, which completes a card J5
 * hold, and it has done so thirteen times. A bit payment is not a card hold:
 * its reply carries no capture handle (the code fell back to the order id),
 * its "token" is the placeholder 0123456789, and Pelecard's public service
 * list (gateway21.pelecard.biz/services, checked 19 November) has no bit or
 * Gama completion call at all. So sending it there can only fail, and the
 * screen says what to do instead: finish it in Pelecard's own interface.
 *
 * How long bit keeps a temporary approval is not in anything Pelecard sent
 * us, so nothing here claims a date. The 20-day card default stored on the
 * row is a card assumption and is not shown for bit.
 */

export type BitHold = {
  /** Pelecard's transaction number — what their interface searches by. */
  transactionNumber: string | null;
  /** Gama's last word on it, e.g. "approved_temporary". */
  gamaStatus: string | null;
};

type Raw = Record<string, unknown>;

function asObject(value: unknown): Raw | null {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Raw;
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Raw) : null;
    } catch {
      return null;
    }
  }
  return null;
}

function str(value: unknown): string | null {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (typeof value === "number") return String(value);
  return null;
}

/** Null for anything that is not bit — cards, Apple Pay, Google Pay, demo. */
export function bitHoldFrom(rawResponse: unknown): BitHold | null {
  const raw = asObject(rawResponse);
  if (!raw) return null;
  const details = asObject(raw.details) ?? asObject(asObject(raw.feedback)?.ResultData) ?? {};
  const body = asObject(raw.rawBody);
  const gama = asObject(body?.GamaData);

  const source = str(details.RecordSource);
  const description = str(details.RecordSourceDescription) ?? "";
  const network = str(gama?.GamaPaymentNetwork) ?? "";

  const isBit = source === "104" || /\bbit\b/i.test(description) || network.toLowerCase() === "bit";
  if (!isBit) return null;

  return {
    transactionNumber: str(details.TransactionPelecardId) ?? str(asObject(raw.feedback)?.PelecardTransactionNumber),
    gamaStatus: str(gama?.GamaLastStatus),
  };
}

/** What the order page and the button say, in one place. */
export function bitHoldMessage(hold: BitHold): string {
  return `תשלום ביט – יש להשלים בממשק פלאקארד${hold.transactionNumber ? ` (עסקה ${hold.transactionNumber})` : ""}. אי אפשר לגבות ביט מהכפתור הזה.`;
}
