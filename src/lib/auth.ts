import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/enums";
import { hashPassword, verifyPassword } from "@/lib/auth-seed-helpers";
import { backOfficeHome, canManageCatalog, isBackOffice, isSiteAdmin } from "@/lib/permissions";

export { hashPassword, verifyPassword };

const SESSION_COOKIE = "prec_session";

// There is exactly one cookie here, and it is httpOnly.
//
// A companion cookie holding the visitor's display name was tried, so the
// header could greet them without asking the server. It is gone, for two
// reasons that outlast the problem it solved. A cookie script can read is a
// cookie *every* script can read: an analytics tag, a pixel, a chat widget,
// any third party ever added to this site would have been handed a customer's
// name without anyone deciding to send it. And two cookies describing one
// session drift apart — a sign-out in another tab, an expiry, a session
// revoked from the admin — leaving a greeting for a session that is over.
//
// The name now comes from the session itself, over /api/session-summary,
// alongside the favourites the same page needs. One request, nothing readable
// by anyone else, and nothing to keep in step.
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(secret);
}

export type SessionPayload = {
  sub: string; // user id
  role: UserRole;
  name: string;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ role: payload.role, name: payload.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  let sub: string, name: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    sub = payload.sub as string;
    name = payload.name as string;
  } catch {
    return null;
  }

  // The JWT signature alone doesn't prove the user still exists — a
  // database restore/migration can leave old browsers holding otherwise-
  // valid sessions for a user id that's gone, which then fails downstream
  // wherever the id is used as a foreign key (e.g. creating a cart). Treat
  // that the same as no session rather than letting it 500 later.
  //
  // The role comes from that row and not from the token, and the round trip
  // was already being paid for. A token is a claim about the moment it was
  // signed: promote someone and nothing happens until they think to sign out
  // and in again, which is a confusing first hour. Revoke someone and it is
  // worse — the browser keeps the access it was granted for as long as the
  // token lives, and revoking is exactly the case where "eventually" is not
  // an acceptable answer.
  const user = await db.user.findUnique({ where: { id: sub }, select: { id: true, role: true } });
  if (!user) return null;

  return { sub, role: user.role as UserRole, name };
}

/* A fresh proof of identity, for the one action a thirty-day cookie is not
 * enough for.
 *
 * Closing an account asks for the password a second time, and the reason is
 * in deleteAccountAction: the session proves this browser was signed in at
 * some point, which on a borrowed or shared phone is not the owner standing
 * there, and deletion is the one thing in the shop with nothing to undo it.
 *
 * An account made through Apple or Google has no password to ask for. The
 * random bytes standing in for one cannot be typed, so for a month the
 * deletion page answered every one of those customers with "wrong password"
 * — which made the accounts opened through Apple the only ones that could
 * not be closed, in the page that exists for App Store guideline 5.1.1(v).
 *
 * So they are asked for the same thing in the only form they have it: sign
 * in with that provider again, now. What comes back is this.
 *
 * Five minutes, and bound to the user id it was granted for — a proof is
 * about one person at one moment, and must not be carryable to another
 * account or kept for later. consumeReauth clears it whether or not it was
 * good, so one re-authentication buys exactly one attempt.
 */
const REAUTH_COOKIE = "prec_reauth";
const REAUTH_TTL_SECONDS = 300;

/* Who asked for a re-authentication, carried across the provider round trip.
 *
 * It cannot be read from the session on the way back, and that is not an
 * oversight to fix later: Apple does not return the visitor with a GET, it
 * form-posts from appleid.apple.com, and a browser does not attach a
 * SameSite=Lax cookie to a cross-site POST. The session cookie is Lax. So the
 * callback that needs to know who this is, is the one place that cannot ask.
 *
 * The entry point can — it is an ordinary same-site navigation — so the id is
 * read there and travels in a cookie the Apple flow already sets as
 * SameSite=None, alongside its state and nonce.
 *
 * Signed rather than written plain, because a cookie is something the visitor
 * holds. An unsigned one would let somebody name another account here; the
 * grant would still be useless to them (the callback only issues it when the
 * provider returns that account's own address, and deleteAccountAction asks
 * for a proof bound to the session's user), but "useless to them" is a chain
 * of three checks, and a signature is one.
 */
const REAUTH_INTENT_TTL_SECONDS = 600;

export async function signReauthIntent(userId: string): Promise<string> {
  return new SignJWT({ purpose: "reauth" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REAUTH_INTENT_TTL_SECONDS}s`)
    .sign(secretKey());
}

export async function readReauthIntent(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (payload.purpose !== "reauth") return null;
    return (payload.sub as string) ?? null;
  } catch {
    return null;
  }
}

export async function grantReauth(userId: string) {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${REAUTH_TTL_SECONDS}s`)
    .sign(secretKey());

  const cookieStore = await cookies();
  /* Lax, not None, although the Apple callback that sets it is answering a
     cross-site POST. SameSite governs when a cookie is *sent*, not whether
     it may be stored, and the only thing that ever reads this is a server
     action on our own origin. */
  cookieStore.set(REAUTH_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: REAUTH_TTL_SECONDS,
  });
}

export async function consumeReauth(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(REAUTH_COOKIE)?.value;
  cookieStore.delete(REAUTH_COOKIE);
  if (!token) return false;

  try {
    const { payload } = await jwtVerify(token, secretKey());
    return payload.sub === userId;
  } catch {
    // Expired, tampered with, or signed by a different deployment's secret.
    return false;
  }
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.sub } });
}

/**
 * The catalog and everything attached to it. NOT the gate for orders — a
 * seller must fail this one and pass requireBackOffice below, which is the
 * whole point of having two.
 */
export async function requireAdmin() {
  const session = await getSession();
  if (!session || !canManageCatalog(session.role)) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/** The principal administrator only — see isSiteAdmin. */
export async function requireSiteAdmin() {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}

/**
 * A page that belongs to running the shop, opened by someone who may not.
 *
 * The sidebar already hides every catalog link from a seller, and that was
 * being treated as the answer — the layout even says so. It is not: hiding
 * a link is presentation, and /admin/products typed into the address bar
 * still rendered supplier costs, as did /admin/pelecard-test with a live
 * card terminal on it. Twenty pages were reachable that way.
 *
 * Redirects rather than throwing, unlike requireAdmin: this is a person
 * who is legitimately signed in and simply landed somewhere that is not
 * their job, and an error page tells them they did something wrong. They
 * get the back office they do have. requireAdmin stays as it is, because
 * an action is not a place you can arrive at by mistake.
 */
export async function requireCatalogPage() {
  const session = await getSession();
  if (!session || !isBackOffice(session.role)) redirect("/admin/login");
  if (!canManageCatalog(session.role)) redirect(backOfficeHome(session.role));
  return session;
}

/** Anyone who works in the back office, including a seller. */
export async function requireBackOffice() {
  const session = await getSession();
  if (!session || !isBackOffice(session.role)) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
