import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/enums";
import { hashPassword, verifyPassword } from "@/lib/auth-seed-helpers";

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

  let sub: string, role: UserRole, name: string;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    sub = payload.sub as string;
    role = payload.role as UserRole;
    name = payload.name as string;
  } catch {
    return null;
  }

  // The JWT signature alone doesn't prove the user still exists — a
  // database restore/migration can leave old browsers holding otherwise-
  // valid sessions for a user id that's gone, which then fails downstream
  // wherever the id is used as a foreign key (e.g. creating a cart). Treat
  // that the same as no session rather than letting it 500 later.
  const user = await db.user.findUnique({ where: { id: sub }, select: { id: true } });
  if (!user) return null;

  return { sub, role, name };
}

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.sub } });
}

export async function requireAdmin() {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "STAFF")) {
    throw new Error("UNAUTHORIZED");
  }
  return session;
}
