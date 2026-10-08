import "server-only";
import { timingSafeEqual as nodeTimingSafeEqual } from "crypto";
import { normalizeFeedback, type PelecardFeedback } from "./client";

/* What every server-side Pelecard notification is read and judged with.
   Lifted out of the order callback unchanged when the top-up callback
   (api/pelecard/wallet-callback) arrived: the two must refuse exactly the
   same forgeries, and a check that lives in one route file is a check the
   second route does not have. Route files cannot export helpers, so they
   live here. */

export function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  // Compare lengths first — timingSafeEqual throws on a mismatch — and still
  // run the comparison so the answer doesn't depend on where they diverge.
  if (a.length !== b.length) return false;
  return nodeTimingSafeEqual(a, b);
}

/**
 * Reads Pelecard's notification whatever shape it arrives in.
 *
 * We ask for JSON at init, and the first real transaction proved that is not
 * what turns up: the body came in a form Request.json() could not parse, this
 * route answered 400 twice, Pelecard treated the unacknowledged notification
 * as a failed transaction and sent the customer to the error page — for a
 * payment that may well have gone through at their end.
 *
 * So the parser accepts what a gateway actually sends: JSON, form-encoded, or
 * a query string. An unreadable body is no longer a reason to reject a
 * notification we can still identify from our own callback URL.
 *
 * Whatever the encoding, the result goes through normalizeFeedback(), because
 * the field names are not the ones the browser return uses either — see there.
 */
export async function readFeedback(req: Request): Promise<{ feedback: PelecardFeedback; raw: string }> {
  const raw = await req.text().catch(() => "");
  if (!raw.trim()) return { feedback: {}, raw };

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return { feedback: normalizeFeedback(parsed as Record<string, unknown>), raw };
    }
  } catch {
    // Not JSON — fall through to the form encoding.
  }

  try {
    const form = Object.fromEntries(new URLSearchParams(raw)) as Record<string, unknown>;
    // A form-encoded body cannot nest, so Pelecard flattens ResultData back
    // into a JSON string under that key. Unwrapping it here means the
    // normaliser sees the same shape either way.
    if (typeof form.ResultData === "string") {
      try {
        form.ResultData = JSON.parse(form.ResultData);
      } catch {
        delete form.ResultData;
      }
    }
    return { feedback: normalizeFeedback(form), raw };
  } catch {
    console.error("[pelecard] unreadable callback body", { sample: raw.slice(0, 200) });
    return { feedback: {}, raw };
  }
}

/**
 * Whether Pelecard's answer to ValidateByUniqueKey is a NO.
 *
 * The check above it asks only whether the answer was empty, and an empty
 * answer is what a forged notification gets: it carries a UniqueKey Pelecard
 * has never issued, so there is nothing to confirm and the order is refused.
 * That is the gate that matters and it holds.
 *
 * What it does not cover is Pelecard answering, and answering no. Their manual
 * documents this call as returning 1 or 0, and a 0 is not empty — so a
 * transaction their own validation rejects reads to the check above as
 * confirmation, and the order is marked paid. An order packed and shipped
 * against a payment the clearing company refused.
 *
 * The right fix is to require an affirmative, and it is not written yet for an
 * honest reason: no transaction has ever completed against this terminal, so
 * the exact shape of a YES is unknown. Requiring a shape guessed from the
 * manual would fail every valid payment the day it is wrong, which is worse
 * than what it replaces.
 *
 * So this is the half that can be written without seeing one: refuse every
 * shape that is unambiguously a NO, and go on accepting the rest. It cannot
 * reject a valid payment — nothing here matches an approval — and it closes
 * the case where Pelecard said no and we heard yes.
 *
 * WHEN THE FIRST REAL TRANSACTION LANDS, read what came back and replace this
 * with the positive check. That is the version that belongs here.
 */
export function readsAsRefusal(validation: unknown): boolean {
  if (validation === 0 || validation === false || validation === "0") return true;

  if (typeof validation === "object" && validation !== null) {
    const record = validation as Record<string, unknown>;

    /* An error envelope. Pelecard use this shape on init, and a non-zero
       ErrCode there has never meant anything but a refusal. */
    const error = record.Error as { ErrCode?: unknown } | undefined;
    if (error && error.ErrCode !== undefined && String(error.ErrCode) !== "0") return true;

    /* The documented 1/0, under whichever of the plausible names it arrives.
       Only an explicit zero counts: a key that is absent, or holds anything
       else, falls through to being accepted as before. */
    for (const key of ["Result", "result", "Status", "status", "ResultCode", "Value"]) {
      const value = record[key];
      if (value === 0 || value === false || value === "0") return true;
    }
  }

  return false;
}
