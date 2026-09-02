import "server-only";
import { pelecardConfig } from "./config";

/* Every call to Pelecard goes through this file, and every call reads the host
   from pelecardConfig() at the moment it is made. */

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { baseUrl } = pelecardConfig();
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Pelecard ${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export interface InitResponse {
  URL?: string;
  ConfirmationKey?: string;
  Error?: { ErrCode: number | string; ErrMsg?: string };
}

/** What comes back from Pelecard, both to the browser and to our server. */
export interface PelecardFeedback {
  PelecardStatusCode?: string;
  PelecardTransactionId?: string;
  PelecardTransactionNumber?: string;
  ApprovalNo?: string;
  Token?: string;
  ParamX?: string;
  UserKey?: string;
  ConfirmationKey?: string;
  TotalX100?: string;
  ErrorMessage?: string;
  /** Pelecard's own record of the transaction, when the notification carried it. */
  ResultData?: Record<string, unknown>;
}

/**
 * Puts Pelecard's server-side notification into the shape the rest of this
 * code expects.
 *
 * It is not the shape their documentation describes for the browser return.
 * The notification arrives nested — `{StatusCode, ErrorMessage, ResultData:{…}}`
 * — and every field we act on lives inside `ResultData` under a different name:
 * the order id is `AdditionalDetailsParamX`, the amount is `DebitTotal`, the
 * approval number is `DebitApproveNumber`. Read flat, all of them are
 * `undefined`, which meant an approved payment would have been recorded as a
 * decline (`undefined !== "000"`) and the customer sent to the error page for a
 * card that was charged. That is the worst failure this integration has.
 *
 * The flat form is still accepted unchanged: it is what the browser gets, and
 * a gateway is free to send either.
 */
export function normalizeFeedback(body: Record<string, unknown>): PelecardFeedback {
  const nested = body.ResultData;
  if (!nested || typeof nested !== "object") return body as PelecardFeedback;

  const rd = nested as Record<string, unknown>;
  const str = (v: unknown) => (v === undefined || v === null || v === "" ? undefined : String(v));

  return {
    // The top-level code is the transaction's verdict; ShvaResult is the same
    // answer from the card network, and stands in if the envelope lacks one.
    PelecardStatusCode: str(body.StatusCode) ?? str(rd.ShvaResult),
    ErrorMessage: str(body.ErrorMessage),
    // The GUID — the id GetTransaction accepts and the one in their payment
    // page's address. The numeric id is a different thing and kept apart.
    PelecardTransactionId: str(rd.TransactionId),
    PelecardTransactionNumber: str(rd.TransactionPelecardId),
    ApprovalNo: str(rd.DebitApproveNumber),
    Token: str(rd.Token),
    ParamX: str(rd.AdditionalDetailsParamX) ?? str(rd.ParamX),
    UserKey: str(rd.UserKey),
    ConfirmationKey: str(rd.ConfirmationKey),
    TotalX100: str(rd.DebitTotal),
    ResultData: rd,
  };
}

export interface TransactionResponse {
  ResultData?: Record<string, unknown>;
  UserData?: Record<string, unknown>;
}

/**
 * Opens a payment. `qa` carries the sandbox-only simulation parameters, and
 * they are refused outright — not warned about — against the production
 * gateway: QAResultStatus forces a result and AuthNum approves anything, so
 * either one reaching production would be a card charge decided by a query
 * parameter.
 */
export function initPayment(
  params: Record<string, unknown>,
  qa?: { qaResultStatus?: string; forceApprove?: boolean }
): Promise<InitResponse> {
  const { terminal, user, password, isSandbox } = pelecardConfig();
  const payload: Record<string, unknown> = { terminal, user, password, ...params };

  if (qa && !isSandbox) {
    throw new Error("QA simulation parameters are forbidden outside the sandbox");
  }
  if (qa?.qaResultStatus) {
    if (!/^\d{3}$/.test(qa.qaResultStatus)) throw new Error("QAResultStatus must be 3 digits");
    payload.QAResultStatus = qa.qaResultStatus;
  }
  if (qa?.forceApprove) payload.AuthNum = "1234567";

  return post<InitResponse>("/PaymentGW/init", payload);
}

/**
 * Asks Pelecard whether the transaction we were just told about is real. An
 * empty body means it is not — this is the check that stands between a forged
 * feedback POST and a paid order.
 */
export function validateByUniqueKey(p: {
  ConfirmationKey: string;
  UniqueKey: string;
  TotalX100: string;
}): Promise<unknown> {
  return post<unknown>("/PaymentGW/ValidateByUniqueKey", p);
}

export function getTransaction(transactionId: string): Promise<TransactionResponse> {
  const { terminal, user, password } = pelecardConfig();
  return post<TransactionResponse>("/PaymentGW/GetTransaction", {
    terminal,
    user,
    password,
    TransactionId: transactionId,
  });
}

/** Safety net for the case where the callback never arrived. Note the field is
    `terminalNumber` here and `terminal` everywhere else — Pelecard's naming. */
export function checkGoodParamX(paramX: string): Promise<unknown> {
  const { terminal, user, password } = pelecardConfig();
  return post<unknown>("/services/CheckGoodParamX", {
    terminalNumber: terminal,
    user,
    password,
    paramX,
    shvaSuccessOnly: "true",
  });
}

/** Card issuer codes, for the record kept against the payment. */
export const CLEARERS: Record<string, string> = {
  "1": "ישראכרט",
  "2": "ויזה כאל",
  "3": "דיינרס",
  "4": "אמריקן אקספרס",
  "6": "לאומי קארד",
};

/** What the customer is told when a payment is declined. */
export const PELECARD_STATUS_MESSAGES: Record<string, string> = {
  "006": "קוד ה-CVV שהוזן שגוי. אפשר לנסות שוב.",
  "033": "הכרטיס אינו תקין. נסו כרטיס אחר.",
  "036": "תוקף הכרטיס פג. נסו כרטיס אחר.",
  "039": "מספר הכרטיס שגוי. בדקו את הספרות ונסו שוב.",
  "125": "הטרמינל אינו מורשה לקבל את סוג הכרטיס הזה. זו הגדרה אצל חברת הסליקה ולא תקלה בכרטיס.",
  "301": "לא קיבלנו תשובה מחברת האשראי. ייתכן שהעסקה כן בוצעה — בדקו את ההזמנות שלכם או צרו קשר לפני ניסיון נוסף.",
};

/** 301 is a timeout, not a decline: the charge may have gone through, so a
    retry is how a customer gets billed twice. */
export const NO_RETRY_STATUS_CODES = ["301"];
