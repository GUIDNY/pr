import "server-only";
import { resolveGateway, isSandboxGateway } from "./gateway";

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

export function pelecardEnabled(): boolean {
  return process.env.PELECARD_ENABLED === "true";
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
