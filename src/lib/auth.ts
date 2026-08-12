import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import type { UserRole } from "@/lib/enums";
import { hashPassword, verifyPassword } from "@/lib/auth-seed-helpers";

export { hashPassword, verifyPassword };

const SESSION_COOKIE = "prec_session";
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

  try {
    const { payload } = await jwtVerify(token, secretKey());
    return {
      sub: payload.sub as string,
      role: payload.role as UserRole,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
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
