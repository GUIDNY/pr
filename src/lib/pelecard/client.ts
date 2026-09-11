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

/**
 * Which card brands this terminal may accept, sent on every init.
 *
 * All five are named every time. Pelecard rejects the request outright — ErrCode
 * 999, before any transaction exists — if one of them is missing or blank, so
 * there is no such thing as "leave out the ones we don't take".
 *
 * Amex and Diners are False because the terminal is not authorised for them.
 * Leaving the door open produced the first live failure: the customer got as
 * far as the card form, and the answer came back from the card network as
 * `125 — terminal not allowed to accept Imex/36 transaction`. Refusing the
 * brand at the gateway means it is never offered in the first place.
 */
export const SUPPORTED_CARDS = {
  Amex: "False",
  Diners: "False",
  Isra: "True",
  Master: "True",
  Visa: "True",
} as const;

/**
 * Where the assets Pelecard load from us actually live.
 *
 * Not the deployment's own address. Pelecard honour CssURL and LogoURL only for
 * URLs their support has registered, one at a time, by hand — and what they
 * registered is the production domain. A preview deployment sending its own
 * address gets no error and no styling: the URL is simply not on the list, so
 * the page renders in their default skin as though nothing had been asked for.
 *
 * So this is fixed rather than derived. Every deployment points at the one
 * approved origin, which is also the only place the files are guaranteed to be
 * reachable. The override exists for the day the shop moves to its own domain,
 * and that day starts with a new whitelist request, not with a deploy.
 */
export const PELECARD_ASSET_ORIGIN =
  process.env.PELECARD_ASSET_ORIGIN?.trim().replace(/\/$/, "") || "https://pr-ayam.vercel.app";

/**
 * How Pelecard's hosted payment page is dressed.
 *
 * The page is theirs and served from their domain — that is the whole point,
 * since it means a card number never touches our servers. But a customer who
 * has just pressed "pay" on a Hebrew shop and lands on an unbranded form has no
 * way to tell they are still buying from the same people, and that is where a
 * checkout is abandoned.
 */
export function paymentPageStyle() {
  return {
    CssURL: `${PELECARD_ASSET_ORIGIN}/pelecard/ai-orange.css`,
    LogoURL: `${PELECARD_ASSET_ORIGIN}/pelecard/logo.png`,

    /* Captions above the fields, not inside them, because that is where the
       shop's own checkout puts them — <Label className="mb-1.5"> over every
       input, in foreground rather than grey. With this True every label on
       Pelecard's page comes back empty and the caption lives in the
       placeholder, which disappears the moment somebody types and leaves a
       filled form with no field names on it.

       The stylesheet depends on this: .control-label is styled to be seen. */
    PlaceholderCaptions: "False",
    // One card-number field, as on our own form — not four boxes.
    SplitCCNumber: "False",
    // A numeric keypad for the card number instead of a full keyboard.
    NumericInputMode: "True",
    // Errors against the field that caused them, not one line at the top.
    InputErrorDisplayByField: "True",
    HiddenPelecardLogo: "True",
    HiddenPciLogo: "True",

    /* HiddenSslSeal was deliberately not sent, on the grounds that the footer it
       controls — the card marks and "התשלום מאובטח ומוצפן" — was the one thing
       on the page telling a customer their details were safe here.

       That was true of a payment page a customer was sent away to. It is not
       true now: this form is embedded in step 3 of our own checkout, directly
       under our own line saying the card is entered at the clearing company and
       never passes through the site, and above their own SSL bar at the top of
       the frame. The footer was a third copy of the same reassurance, and it
       was the last hundred-odd pixels standing between the form and fitting in
       the frame without a scrollbar of its own. */
    HiddenSslSeal: "True",
  };
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
  // Not a decline, and saying "declined" here is wrong in a way that costs a
  // sale: the card is fine, the identity check (3D Secure) did not complete.
  "650": "האימות מול חברת האשראי לא הושלם. הכרטיס שלכם תקין — אפשר לנסות שוב ולאשר את ההודעה שנשלחת אליכם.",
};

/** 301 is a timeout, not a decline: the charge may have gone through, so a
    retry is how a customer gets billed twice. */
export const NO_RETRY_STATUS_CODES = ["301"];

/**
 * Whether checkout should hold the money instead of taking it.
 *
 * Off, and off is not a placeholder — it is the only setting that is safe
 * until two things outside this repository are true:
 *
 *   The terminal at Pelecard is configured to accept J5. Sending J5 to a
 *   terminal set up for J4 does not hold anything; it fails, and it fails at
 *   the moment a customer is trying to pay.
 *
 *   Pelecard have told us the name of their capture call. This file knows
 *   three of their endpoints — init, ValidateByUniqueKey, GetTransaction —
 *   and none of them takes a held transaction and charges it. Guessing an
 *   endpoint that moves money is not a thing to do from a comment.
 *
 * Until both are true, a held payment could be taken but never captured,
 * which is worse than not holding at all: the customer's money is frozen and
 * the shop cannot collect it. So the switch stays off and capturePayment
 * refuses rather than pretending.
 */
export function holdThenCapture(): boolean {
  return process.env.PELECARD_HOLD_THEN_CAPTURE === "1";
}

export type CaptureResult = { ok: true } | { ok: false; error: string };

/**
 * How long a hold is treated as good for.
 *
 * Not a fact about this codebase — the real window is set by the card
 * networks and passed on by Pelecard, and it differs by card and by issuer.
 * So it is configurable and the default is short. Being wrong in the
 * cautious direction means chasing an order a few days early; being wrong
 * the other way means discovering on day 30 that the money was never
 * collectable and the goods have gone.
 */
export function holdDays(): number {
  const raw = Number(process.env.PELECARD_HOLD_DAYS);
  return Number.isFinite(raw) && raw > 0 ? raw : 20;
}

/**
 * The handle CompleteDebitByUid needs, dug out of Pelecard's reply.
 *
 * Their field for it is not in the three endpoints this file already speaks,
 * so rather than assert one name this tries the plausible ones in order and
 * returns null when none of them is there. Null is not swallowed: the
 * callback raises a loud alert naming every key the reply actually contained,
 * so the first hold in the sandbox tells us the field name instead of us
 * guessing it. And nothing is lost either way — the whole reply is kept in
 * Payment.rawResponse, so a hold taken before we knew the name can still be
 * captured once we do.
 */
export function authorizationUidFrom(feedback: PelecardFeedback): string | null {
  const rd = feedback.ResultData ?? {};
  const candidates = ["Uid", "UID", "uid", "DebitUid", "TransactionUid", "UniqueKey", "UserKey"];
  for (const key of candidates) {
    const value = rd[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/**
 * Turn a held authorisation into an actual charge.
 *
 * The one rule that is not ours to bend: **the completing charge can never
 * exceed what was held.** The hold is the customer's agreement to a number,
 * and a bigger charge is not a bigger sale, it is a chargeback. Checked here
 * as well as at the call site, because this is the function that talks to the
 * money and a guard that lives only in the UI is a guard that a second UI
 * will not have.
 *
 * If the total could rise between the hold and the charge — an added item, a
 * delivery fee — the hold has to be taken for the higher figure up front.
 * There is no way to grow one afterwards.
 */
export async function completeDebitByUid(p: {
  uid: string;
  totalAgorot: number;
  heldAgorot: number;
}): Promise<CaptureResult> {
  if (!Number.isInteger(p.totalAgorot) || p.totalAgorot <= 0) {
    return { ok: false, error: "סכום גבייה לא תקין" };
  }
  if (p.totalAgorot > p.heldAgorot) {
    return {
      ok: false,
      error: `אי אפשר לגבות ${(p.totalAgorot / 100).toLocaleString("he-IL")} ₪ מתפיסה של ${(p.heldAgorot / 100).toLocaleString("he-IL")} ₪. גבייה משלימה לא יכולה להיות גבוהה מהסכום שנתפס.`,
    };
  }

  const path = process.env.PELECARD_COMPLETE_DEBIT_PATH;
  if (!path) {
    return {
      ok: false,
      error:
        "נתיב הגבייה של פלאקארד לא מוגדר. צריך להגדיר PELECARD_COMPLETE_DEBIT_PATH לפי Hotels API Technical Guide (CompleteDebitByUid).",
    };
  }

  try {
    const result = await post<Record<string, unknown>>(path, {
      ...pelecardCredentials(),
      Uid: p.uid,
      TotalX100: String(p.totalAgorot),
    });
    /* Their success code is "000" everywhere else in this integration, and a
       reply that does not say so is not treated as a charge. Anything
       ambiguous fails closed: the caller leaves the hold open and a person
       looks at it, which is recoverable. Reporting a charge that did not
       happen is not. */
    const code = String(result.StatusCode ?? result.PelecardStatusCode ?? "");
    if (code === "000") return { ok: true };
    return {
      ok: false,
      error: `פלאקארד החזירו ${code || "תשובה לא מזוהה"}${result.ErrorMessage ? ` — ${result.ErrorMessage}` : ""}`,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "שגיאה בגבייה" };
  }
}

function pelecardCredentials() {
  const { terminal, user, password } = pelecardConfig();
  return { terminal, user, password };
}
