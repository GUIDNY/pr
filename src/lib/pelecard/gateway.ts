/**
 * The two Pelecard hosts, and the rule for choosing between them.
 *
 * This file exists so those two strings are written down exactly once and can
 * still be read from the proxy, which cannot import the server-only
 * config module. Everything else goes through src/lib/pelecard/config.ts.
 */

export const PELECARD_TEST_BASE = "https://gateway20.pelecard.biz";
export const PELECARD_PROD_BASE = "https://gateway21.pelecard.biz";

export type ResolvedGateway = { baseUrl: string; isSandbox: boolean };

/**
 * Returns the configured gateway, or an error describing why there isn't one.
 * Reaching the production host takes a second, explicit acknowledgement: the
 * same credentials work against both, so the host is the entire difference
 * between a test and a real charge.
 */
export function resolveGateway(env: NodeJS.ProcessEnv = process.env):
  | { ok: true; gateway: ResolvedGateway }
  | { ok: false; error: string } {
  const baseUrl = env.PELECARD_BASE_URL?.trim();
  if (!baseUrl) return { ok: false, error: "PELECARD_BASE_URL is not set" };

  if (baseUrl !== PELECARD_TEST_BASE && baseUrl !== PELECARD_PROD_BASE) {
    return {
      ok: false,
      error: `PELECARD_BASE_URL must be exactly ${PELECARD_TEST_BASE} or ${PELECARD_PROD_BASE}`,
    };
  }

  if (baseUrl === PELECARD_PROD_BASE && env.PELECARD_ALLOW_PRODUCTION !== "I_UNDERSTAND") {
    return {
      ok: false,
      error:
        "Refusing to use the Pelecard PRODUCTION gateway. " +
        "Set PELECARD_ALLOW_PRODUCTION=I_UNDERSTAND to enable real charges.",
    };
  }

  return { ok: true, gateway: { baseUrl, isSandbox: baseUrl === PELECARD_TEST_BASE } };
}

/** Non-throwing: is this build pointed at the test gateway? */
export function isSandboxGateway(env: NodeJS.ProcessEnv = process.env): boolean {
  const resolved = resolveGateway(env);
  return resolved.ok && resolved.gateway.isSandbox;
}

/**
 * The one way the payment console is allowed to exist against the gateway that
 * takes real money: a merchant testing their own terminal with their own card,
 * because the test gateway cannot complete a transaction at all.
 *
 * Every payment it opens is a real charge. So it takes four things at once, and
 * losing any one of them turns it off:
 *
 *  - the production gateway, deliberately chosen (PELECARD_ALLOW_PRODUCTION);
 *  - PELECARD_LIVE_TEST set to a value nobody types by accident;
 *  - a deployment that is NOT the production one — the live site can never
 *    carry this page, whatever its variables say;
 *  - an admin session, checked where the page and the action run.
 *
 * The amount is capped separately, in the action. A switch that can charge a
 * card should not also decide how much.
 */
export function isLiveTestConsoleEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.PELECARD_LIVE_TEST !== "I_WILL_BE_CHARGED") return false;
  // Vercel sets this to "production" on the live deployment. Missing (local) is
  // fine; equal to "production" is never fine.
  if (env.VERCEL_ENV === "production") return false;
  const resolved = resolveGateway(env);
  return resolved.ok && !resolved.gateway.isSandbox;
}

/** Whether the payment console exists at all — sandbox, or a deliberate live test. */
export function isPaymentConsoleAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSandboxGateway(env) || isLiveTestConsoleEnabled(env);
}
