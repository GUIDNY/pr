import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { googleNativeConfigured, verifyGoogleIdToken } from "@/lib/google-oauth";

export const dynamic = "force-dynamic";

/**
 * Sign in with Google, the way it has to work inside the app.
 *
 * The web flow next door cannot be used there at all, and not because of
 * anything this code does: Google refuses OAuth from an embedded WebView as a
 * matter of policy — "disallowed_useragent" — so that the page asking for a
 * password is never one the host app could have drawn. The browser is right
 * to be refused. What the app does instead is ask iOS for the sign-in sheet,
 * which is not a page this app can draw either, and post the resulting
 * id_token here from inside the WebView, so the session cookie is set where
 * the app can see it.
 *
 * No nonce, and the difference from the Apple route beside this one is worth
 * stating rather than looking like an oversight. Google's iOS SDK mints a
 * fresh id_token per sign-in, short-lived and bound to this app through `aud`
 * — a captured one buys an attacker the few minutes before it expires, and
 * only if they already hold the victim's device traffic. Apple's sheet hands
 * the same token back on a re-authorisation, which is why that one is pinned
 * to a server-issued value and this one is not.
 */
export async function POST(request: Request) {
  if (!googleNativeConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  let body: { idToken?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const idToken = typeof body.idToken === "string" ? body.idToken : null;
  if (!idToken) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const profile = await verifyGoogleIdToken(idToken);
  if (!profile) return NextResponse.json({ error: "google_token" }, { status: 401 });
  if (!profile.emailVerified) {
    return NextResponse.json({ error: "google_unverified" }, { status: 403 });
  }

  let user = await db.user.findUnique({ where: { email: profile.email } });

  if (!user) {
    /* Same as the web callback: a hash of bytes nobody keeps, so the account
       is reachable through Google only until its owner sets a password. */
    const unusable = await hashPassword(randomBytes(32).toString("base64url"));
    user = await db.user.create({
      data: {
        email: profile.email,
        name: profile.name,
        passwordHash: unusable,
        hasPassword: false,
        role: "CUSTOMER",
      },
    });

    /* And the same guest-order claim every other sign-up path makes. */
    await db.order.updateMany({
      where: {
        userId: null,
        guestEmail: { equals: profile.email, mode: "insensitive" },
        ownerDeletedAt: null,
      },
      data: { userId: user.id },
    });
  }

  await createSession({ sub: user.id, role: user.role as never, name: user.name });

  /* No redirect: the caller is a fetch from a page that is already open and
     reloads itself. */
  return NextResponse.json({ ok: true, role: user.role });
}
