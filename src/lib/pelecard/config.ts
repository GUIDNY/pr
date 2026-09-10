import "server-only";
import { resolveGateway, isSandboxGateway, isLiveTestConsoleEnabled, isPaymentConsoleAvailable } from "./gateway";
import { isBackOffice } from "@/lib/permissions";

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

  /* Trimmed: a credential pasted into a dashboard field can carry a trailing
     newline, and Pelecard would reject it with an error about the terminal
     rather than about the whitespace. */
  const terminal = process.env.PELECARD_TERMINAL?.trim();
  const user = process.env.PELECARD_USER?.trim();
  const password = process.env.PELECARD_PASSWORD?.trim();
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
 *
 * IT DEFAULTS TO ON, and it did not always. Opt-in was right while the shop was
 * being built: nothing was configured, nobody was buying, and the cost of
 * forgetting to set it was zero. The shop is open now, and the same default
 * means a checkout that quietly shows a demo form to paying customers — which
 * costs a sale every time and looks like nothing is wrong.
 *
 * So the kill switch stays and its polarity flips: PELECARD_ENABLED=false turns
 * card payment off for the whole shop, in one dashboard field, with no deploy.
 * That is the direction that needs to be one field, because it is the one
 * somebody reaches for at three in the morning.
 *
 * Nothing else about the safety design changes. Reaching the production gateway
 * still needs PELECARD_ALLOW_PRODUCTION=I_UNDERSTAND, credentials are still
 * required, and an unconfigured gateway is still demo for everyone — this
 * cannot arm anything on its own.
 */
export function pelecardEnabled(): boolean {
  /* Case-insensitive, and that is not tidiness. This is the one comparison in
     the file where a near miss fails OPEN: somebody typing FALSE to stop card
     payments would have stopped nothing, and believed otherwise. A switch that
     turns things off has to accept every spelling of off. */
  return process.env.PELECARD_ENABLED?.trim().toLowerCase() !== "false";
}

/**
 * WHO PAYS FOR REAL, AND WHO ONLY SEES THE FORM.
 *
 * pelecardEnabled() above is one global answer for the whole shop. That was
 * enough while the only question was "are customers on the gateway yet", and
 * it stopped being enough the moment the answer had to differ per account:
 * one account charging real cards so the round trip can be exercised against
 * the live terminal, while the admin and the staff's own logins stay on the
 * demo lane and can be clicked through without spending money.
 *
 * THE POLICY IS CONFIGURATION, NOT CODE, and that is deliberate. Which account
 * charges a real card is a decision that changes, and it is the one decision
 * where being wrong costs somebody money. Baked into a deploy it takes six
 * minutes and a build to reverse; in an environment variable it takes one
 * dashboard field, and it can be reversed at three in the morning by somebody
 * who does not have the repository open.
 *
 * Read in this order, first match wins:
 *
 *   1. Not configured at all      -> demo. Nothing can charge.
 *   2. Listed in DEMO_EMAILS      -> demo, even when the shop is open. This is
 *                                    the override that cannot be lost: an
 *                                    account named here never charges a card,
 *                                    whatever else is set.
 *   3. A back-office role         -> demo. The shop's own staff walk the order
 *                                    flow all day; none of those runs is meant
 *                                    to move money. See below.
 *   4. Listed in LIVE_EMAILS,     -> gateway, even when the shop is closed.
 *      or in BUILT_IN_LIVE_EMAILS      The account used to test against the real
 *                                      terminal before opening to customers.
 *   5. Everyone else, guests     -> the global switch, PELECARD_ENABLED. A
 *      included                        guest has no account to name in a list
 *                                      and no role to hold, so the shop being
 *                                      open is the whole answer for them.
 *
 * THE VIEWER COMES FROM THE SESSION AND NEVER FROM THE FORM. The checkout asks
 * a guest for an email and that field is whatever they typed; deciding the
 * lane from it would mean anyone could type their way onto — or off — the
 * gateway. Callers pass the account on the signed cookie or nothing at all.
 *
 * It takes the viewer rather than the address for the sake of rule 3, and the
 * shape is the point: a second optional argument would have gone on compiling
 * everywhere it was left out, and the place it was left out is the place an
 * admin gets charged. Nothing here can be called with half a viewer.
 */
export type CheckoutLane = "gateway" | "demo";

/** As much of the signed-in account as the lane depends on. */
export type CheckoutViewer = { email?: string | null; role?: string | null };

/**
 * The account that pays for real while the shop itself is still closed.
 *
 * In code rather than in the environment, which is the opposite of what the
 * comment above argues for, and the reason is plain: there is no way to write
 * a Vercel variable from here, and the alternative to this line is the lane
 * not existing until somebody opens a dashboard.
 *
 * It is safe to hard-code precisely because it is not the last word.
 * PELECARD_DEMO_EMAILS is read BEFORE this list, so putting this same address
 * there puts it straight back on the demo lane — from the dashboard, with no
 * deploy and no code change. Clearing any credential does the same thing for
 * every account at once, since an unconfigured gateway is demo for everyone.
 *
 * Note what this account charges: the FULL basket, not the ₪1 of the staff
 * test button. It is the lane for one deliberate end-to-end run, not for
 * repeated experiments.
 */
const BUILT_IN_LIVE_EMAILS = ["eitan@example.com"];

function emailList(name: string): string[] {
  return (process.env[name] ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

export function paymentLaneFor(viewer: CheckoutViewer | null | undefined): CheckoutLane {
  if (!pelecardConfigured()) return "demo";

  const email = viewer?.email?.trim().toLowerCase();

  if (email && emailList("PELECARD_DEMO_EMAILS").includes(email)) return "demo";

  /* The shop's own people, on the demo lane for as long as they hold the role.
     Not a list of addresses: a list would have to be edited every time someone
     is hired, and the failure mode of forgetting is a real card charged for a
     rehearsal. The role is already the thing the rest of the back office is
     decided by, and it is on the signed cookie, so it costs nothing to ask.

     Above the live list on purpose. An address in both is somebody who was put
     on the gateway once and then given a back-office role, and the safe answer
     to that contradiction is the one that does not spend money. To put a staff
     account on the real gateway, take the role away from it or use an account
     that never had one. */
  if (isBackOffice(viewer?.role)) return "demo";

  if (email && [...BUILT_IN_LIVE_EMAILS, ...emailList("PELECARD_LIVE_EMAILS")].includes(email)) return "gateway";

  /* A guest follows the shop switch, and there is deliberately no way to say
     otherwise. There used to be one — PELECARD_DEMO_ANONYMOUS — and it was a
     trap: most customers check out without an account, so with it set the shop
     was open and taking no card payments at all, and the only symptom was a
     demo form nobody signed in ever saw. */
  return pelecardEnabled() ? "gateway" : "demo";
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
