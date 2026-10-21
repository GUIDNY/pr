import { SignJWT, jwtVerify } from "jose";

/**
 * Who may see the 3D mall, for now.
 *
 * Until the patent application is filed the game is private: only the
 * company's own people get in, and nothing public on the shop points at it.
 * The game's own host (play.buytoday.co.il) refuses every page request that
 * does not carry a pass, and a pass is only ever minted here, by
 * /api/game/pass, for a signed-in account that mallAllowed says yes to.
 *
 * Who that is, since 21 October: every management account — a user whose
 * role is ADMIN, STAFF or SELLER, which is what the back office already
 * means by "one of us" — and, as before, the two addresses on the list.
 * So the owner adds a person to the game the way they add them to the
 * back office, by giving the account a role, and there is no second list
 * to keep in step.
 *
 * The pass is a short JWT signed with MALL_GATE_SECRET, a key shared by this
 * project and the game's project on Vercel and nothing else. No secret, no
 * pass: a missing key fails closed on both sides. It carries `ok: true`,
 * which is the authorisation itself — the only thing that can sign it is
 * this shop, and this shop only signs it after mallAllowed — so a verifier
 * needs no list of its own. The game's middleware (public/store-game/
 * middleware.js in GUIDNY/stockgame) still compares the email to its own
 * copy of the two addresses, and until it reads `ok` instead, a management
 * account's pass opens /mall here and is refused on play.buytoday.co.il.
 */
export const MALL_ALLOWED_EMAILS = new Set([
  "bd12123@gmail.com",
  "asaf@buytoday.co.il",
]);
export const MALL_ALLOWED_ROLES = new Set(["ADMIN", "STAFF", "SELLER"]);

export const MALL_PASS_COOKIE = "bt_mall_pass";
export const MALL_PASS_TTL_SECONDS = 60 * 60 * 24 * 30;

export function mallAllowedEmail(email: string | null | undefined): boolean {
  return !!email && MALL_ALLOWED_EMAILS.has(email.trim().toLowerCase());
}

/** The whole rule: a management role, or one of the listed addresses. */
export function mallAllowed(user: { email: string | null | undefined; role: string | null | undefined }): boolean {
  return (!!user.role && MALL_ALLOWED_ROLES.has(user.role)) || mallAllowedEmail(user.email);
}

function gateKey(): Uint8Array | null {
  const s = process.env.MALL_GATE_SECRET;
  return s && s.length >= 32 ? new TextEncoder().encode(s) : null;
}

export async function signMallPass(email: string): Promise<string | null> {
  const key = gateKey();
  if (!key) return null;
  return new SignJWT({ email: email.trim().toLowerCase(), ok: true })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("bt-mall")
    .setIssuedAt()
    .setExpirationTime(`${MALL_PASS_TTL_SECONDS}s`)
    .sign(key);
}

/** The pass, if it is ours and unexpired: one this shop signed after
    mallAllowed (`ok`), or an older one for an address on the list. */
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
    return payload.ok === true || mallAllowedEmail(payload.email as string);
  } catch {
    return false;
  }
}
