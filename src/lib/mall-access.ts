import { SignJWT, jwtVerify } from "jose";

/**
 * Who may see the 3D mall, for now.
 *
 * Until the patent application is filed the game is private: only these
 * accounts get in, and nothing public on the shop points at it. The game's
 * own host (play.buytoday.co.il) refuses every page request that does not
 * carry a pass, and a pass is only ever minted here, by /api/game/pass, for
 * a signed-in account whose email is on this list.
 *
 * The pass is a short JWT signed with MALL_GATE_SECRET, a key shared by this
 * project and the game's project on Vercel and nothing else. No secret, no
 * pass: a missing key fails closed on both sides.
 */
export const MALL_ALLOWED_EMAILS = new Set([
  "bd12123@gmail.com",
  "asaf@buytoday.co.il",
]);

export const MALL_PASS_COOKIE = "bt_mall_pass";
export const MALL_PASS_TTL_SECONDS = 60 * 60 * 24 * 30;

export function mallAllowedEmail(email: string | null | undefined): boolean {
  return !!email && MALL_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

function gateKey(): Uint8Array | null {
  const s = process.env.MALL_GATE_SECRET;
  return s && s.length >= 32 ? new TextEncoder().encode(s) : null;
}

export async function signMallPass(email: string): Promise<string | null> {
  const key = gateKey();
  if (!key) return null;
  return new SignJWT({ email: email.trim().toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("bt-mall")
    .setIssuedAt()
    .setExpirationTime(`${MALL_PASS_TTL_SECONDS}s`)
    .sign(key);
}

/** The pass, if it is ours, unexpired, and for an account still on the list. */
export async function verifyMallPass(
  token: string | undefined,
): Promise<boolean> {
  const key = gateKey();
  if (!key || !token) return false;
  try {
    const { payload } = await jwtVerify(token, key, {
      audience: "bt-mall",
      algorithms: ["HS256"],
    });
    return mallAllowedEmail(payload.email as string);
  } catch {
    return false;
  }
}
