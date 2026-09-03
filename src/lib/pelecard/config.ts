import "server-only";
import { resolveGateway, isSandboxGateway, isLiveTestConsoleEnabled, isPaymentConsoleAvailable } from "./gateway";

/* Pelecard has no separate test credentials: the same terminal/user/password
   work against both environments, and the ONLY thing deciding whether a card
   is really charged is which host the request goes to. One hard-coded string
   left behind on the day of the switch is a real charge nobody meant to make.

   So the host comes from the environment and from nowhere else, it is checked
   against the two hosts that actually exist, and reaching for production takes
   a second, deliberate variable. These two constants are the only place in the
   codebase where either hostname is written down. */

export type PelecardEnvironment = "sandbox" | "production";

export type PelecardConfig = {
  baseUrl: string;
  environment: PelecardEnvironment;
  isSandbox: boolean;
  terminal: string;
  user: string;
  password: string;
};

/* Resolved on first use rather than at import time, and this is a deliberate
   departure from the spec's `export const PELECARD_BASE_URL = resolveBaseUrl()`.
   A throw at module scope in Next.js takes down every route that transitively
   imports it — the storefront included — and a build with the variable unset
   would fail outright. A payment misconfiguration must stop payments, not the
   shop. Everything that touches Pelecard goes through here, so a bad
   configuration still fails immediately, loudly, and before any request is
   sent to any gateway. */
export function pelecardConfig(): PelecardConfig {
  const resolved = resolveGateway();
  if (!resolved.ok) throw new Error(resolved.error);

  const terminal = process.env.PELECARD_TERMINAL;
  const user = process.env.PELECARD_USER;
  const password = process.env.PELECARD_PASSWORD;
  if (!terminal || !user || !password) throw new Error("Pelecard credentials are missing");

  const { baseUrl, isSandbox } = resolved.gateway;
  return {
    baseUrl,
    environment: isSandbox ? "sandbox" : "production",
    isSandbox,
    terminal,
    user,
    password,
  };
}

/**
 * Whether CUSTOMERS pay by card. This is the "moment of truth" switch and
 * nothing else: with it off, the storefront checkout behaves exactly as it did
 * before Pelecard existed, and a shopper is never sent to a gateway.
 *
 * It is deliberately not the same question as "are the credentials present".
 * The two were one switch until the merchant needed to work on the real payment
 * page against the live terminal while the shop kept taking orders the old way
 * — which is impossible if the only thing that arms the gateway also opens it
 * to every visitor.
 */
export function pelecardEnabled(): boolean {
  return process.env.PELECARD_ENABLED === "true";
}

/**
 * Whether a payment COULD be opened: a valid gateway host, the production
 * acknowledgement if that host is production, and credentials.
 *
 * This is what the admin test lane runs on, so a ₪1 test transaction can be
 * opened on the live deployment while customer card payment is still off.
 * Being configured is not permission to charge a customer — every caller has
 * to answer that question for itself.
 */
export function pelecardConfigured(): boolean {
  try {
    pelecardConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * True only when Pelecard is both switched on and pointed at the test gateway.
 * The QA simulation parameters and the internal test page are gated on this,
 * so neither can exist in a build that can charge a card.
 */
export function isPelecardSandbox(): boolean {
  return isSandboxGateway();
}

/**
 * True when the console is opening REAL charges against the production gateway.
 * Everything gated on this has to say so to the person using it.
 */
export function isPelecardLiveTest(): boolean {
  return isLiveTestConsoleEnabled();
}

/** True when the payment console exists — in either mode. */
export function isPelecardConsoleAvailable(): boolean {
  return isPaymentConsoleAvailable();
}

/** The most a single live test may charge. A slip of the keyboard on a real
    card should cost pocket change, not a fridge. */
export const LIVE_TEST_MAX_SHEKELS = 5;

/**
 * What an admin test order costs. One shekel, always, and not a number anybody
 * types: the whole point of the lane is that it can be run again and again
 * without anyone having to think about the amount first, and a test that is
 * cheap by convention becomes expensive the first time someone is in a hurry.
 *
 * It is a real charge on a real card. Pelecard's test gateway cannot complete a
 * transaction against this terminal, so there is no free way to find out
 * whether the live one works.
 */
export const TEST_ORDER_SHEKELS = 1;

/**
 * Shekels (a float, which is how this database stores money) → agorot (an
 * integer, which is what Pelecard charges in). The single conversion point in
 * the system: 149.90 * 100 is 14989.999999999998 in binary floating point, and
 * a second conversion written somewhere else is how a cart gets charged a
 * shekel short.
 */
export function toAgorot(shekels: number): number {
  const agorot = Math.round(shekels * 100);
  if (!Number.isFinite(agorot) || agorot <= 0) throw new Error(`Invalid amount: ${shekels}`);
  return agorot;
}

export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!url) throw new Error("NEXT_PUBLIC_SITE_URL is not set");
  return url.replace(/\/$/, "");
}

export function callbackSecret(): string {
  const secret = process.env.PELECARD_CALLBACK_SECRET;
  if (!secret) throw new Error("PELECARD_CALLBACK_SECRET is not set");
  return secret;
}
