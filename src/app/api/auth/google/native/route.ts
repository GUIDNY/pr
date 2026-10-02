import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { claimGuestCart } from "@/lib/cart";
import { googleNativeClientIds, googleNativeConfigured, verifyGoogleIdToken } from "@/lib/google-oauth";

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
/**
 * The client ids the sheet has to be initialised with, read by the button
 * just before it opens one.
 *
 * A fetch rather than a value baked into the page, so that the id the sheet
 * is initialised with and the audience the POST below verifies against are
 * the same string by construction. They used to be two reads of one variable
 * — one at build time into the bundle, one at request time here — and that is
 * exactly how a trailing newline pasted into a dashboard field got to read as
 * configured on the server and as a different client id in the app, which the
 * Google SDK answers by raising an NSException rather than failing to sign
 * in. A crash on a button press, from an invisible character, found only by
 * pulling the literal out of a deployed bundle.
 *
 * Public by nature: an OAuth client id travels in every authorisation request
 * and identifies the app rather than authenticating it. Nothing here is a
 * secret and the route takes no session.
 */
export async function GET() {
  const ids = googleNativeClientIds();
  if (!ids) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  return NextResponse.json(ids);
}

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
  /* The cart this browser filled before signing in. Without this the shop
     answers a fresh sign-in with an empty cart — see claimGuestCart. */
  await claimGuestCart(user.id);

  /* No redirect: the caller is a fetch from a page that is already open and
     reloads itself. */
  return NextResponse.json({ ok: true, role: user.role });
}
