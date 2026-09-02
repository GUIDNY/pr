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
