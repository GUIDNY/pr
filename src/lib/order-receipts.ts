import "server-only";
import { cookies } from "next/headers";

/**
 * The orders THIS BROWSER placed.
 *
 * The confirmation page has to be reachable the instant an order is created,
 * by someone who may have no account — so it cannot ask who you are. It was
 * therefore showing any order to anyone who named it, and order numbers are
 * `PR-` and six digits, which is a guessable space.
 *
 * This is the missing half: checkout drops a note in the buyer's own browser,
 * and the confirmation page shows the order to whoever holds that note (or to
 * the signed-in account that owns it). Anybody else is sent to order tracking,
 * where naming the email or phone on the order is what opens it.
 *
 * It is a receipt, not a credential: it proves this browser placed the order,
 * nothing more, and losing it costs nothing — tracking still works.
 */
const RECEIPTS_COOKIE = "prec_orders";
const RECEIPTS_TTL_SECONDS = 60 * 60 * 24 * 60; // 60 days
/* Enough for a shopper's recent history, bounded so the cookie cannot grow
   without limit on a browser that orders often. Oldest fall off the end. */
const MAX_RECEIPTS = 20;

function parse(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").filter(Boolean);
}

export async function rememberOrder(orderNumber: string) {
  const cookieStore = await cookies();
  const existing = parse(cookieStore.get(RECEIPTS_COOKIE)?.value);
  const next = [orderNumber, ...existing.filter((n) => n !== orderNumber)].slice(0, MAX_RECEIPTS);

  cookieStore.set(RECEIPTS_COOKIE, next.join(","), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // The gateway sends the customer back here from Pelecard's own domain, and
    // that is a top-level GET — which lax allows and strict would not.
    sameSite: "lax",
    path: "/",
    maxAge: RECEIPTS_TTL_SECONDS,
  });
}

export async function browserPlacedOrder(orderNumber: string): Promise<boolean> {
  const cookieStore = await cookies();
  return parse(cookieStore.get(RECEIPTS_COOKIE)?.value).includes(orderNumber);
}
