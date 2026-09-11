import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { createSession, hashPassword } from "@/lib/auth";
import { appleNativeConfigured, verifyAppleIdentityToken } from "@/lib/apple-oauth";

export const dynamic = "force-dynamic";

const NONCE_COOKIE = "apple_native_nonce";
/** Longer than anybody spends on a Face ID sheet, shorter than a shared device. */
const NONCE_TTL_SECONDS = 300;

/**
 * Sign in with Apple, the way it works inside the app.
 *
 * The web flow next door leaves for appleid.apple.com and comes back with a
 * form POST. That cannot work in the app: a WebView either refuses the
 * navigation or hands it to Safari, where the session cookie lands in a
 * browser the app cannot see — which is what happened on the first TestFlight
 * build. The native sheet avoids the round trip entirely. iOS asks for Face
 * ID, hands the page an identity token, and the page posts it here from
 * inside the WebView, so the cookie this sets is set exactly where it is
 * needed. No deep link, no Universal Link, no one-time code.
 *
 * GET mints the nonce, POST redeems it.
 *
 * THE NONCE IS NOT DECORATION. Without it an identity token captured once —
 * from a log, a proxy, a rooted phone — can be posted here again by anybody,
 * and it would still verify: it is a valid, correctly signed token. Binding
 * it to a value this server issued, kept in an httpOnly cookie and accepted
 * once, is what makes a replay fail.
 */
export async function GET() {
  if (!appleNativeConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const nonce = randomBytes(32).toString("base64url");
  const jar = await cookies();
  jar.set(NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: NONCE_TTL_SECONDS,
  });

  // The page needs it to pass to the native sheet; the copy that decides
  // anything is the one in the cookie, which the page cannot read or forge.
  return NextResponse.json({ nonce });
}

export async function POST(request: Request) {
  if (!appleNativeConfigured()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const jar = await cookies();
  const expectedNonce = jar.get(NONCE_COOKIE)?.value ?? null;
  // Single use, whatever happens below.
  jar.delete(NONCE_COOKIE);

  let body: { identityToken?: unknown; name?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const identityToken = typeof body.identityToken === "string" ? body.identityToken : null;
  if (!identityToken) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const result = await verifyAppleIdentityToken(identityToken);
  if (!result.ok) {
    /* Apple's own words to the log, one flat answer to the caller. Which of
       expiry, signature and audience failed is only useful to somebody
       probing. */
    console.error("[apple/native] identity token rejected:", result.detail);
    return NextResponse.json({ error: "apple_token" }, { status: 401 });
  }

  const profile = result.profile;
  if (!expectedNonce || !noncesMatch(profile.nonce, expectedNonce)) {
    return NextResponse.json({ error: "apple_nonce" }, { status: 401 });
  }
  if (!profile.emailVerified) {
    return NextResponse.json({ error: "apple_unverified" }, { status: 403 });
  }

  /* The name arrives once in a lifetime — on the first authorisation and
     never again, exactly as in the web callback. The plugin gives the page
     givenName and familyName at that moment and nothing afterwards. */
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;

  let user = await db.user.findUnique({ where: { email: profile.email } });

  if (!user) {
    /* Same as the web callback: a hash of bytes nobody keeps, so the account
       is reachable through Apple only until its owner sets a password from
       the account page. */
    const unusable = await hashPassword(randomBytes(32).toString("base64url"));
    user = await db.user.create({
      data: {
        email: profile.email,
        name: name ?? profile.email.split("@")[0],
        passwordHash: unusable,
        hasPassword: false,
        role: "CUSTOMER",
      },
    });

    /* And the same claim every other sign-up path makes: a first order is
       usually placed as a guest, and without this it stays ownerless while
       its owner looks at an empty order list. */
    await db.order.updateMany({
      where: {
        userId: null,
        guestEmail: { equals: profile.email, mode: "insensitive" },
        ownerDeletedAt: null,
      },
      data: { userId: user.id },
    });
  } else if (name && isPlaceholderName(user.name, user.email)) {
    user = await db.user.update({ where: { id: user.id }, data: { name } });
  }

  await createSession({ sub: user.id, role: user.role as never, name: user.name });

  /* No redirect. The caller is a fetch from a page that is already open, and
     it reloads itself — a redirect here would only be followed by the fetch. */
  return NextResponse.json({ ok: true, role: user.role });
}

/** Is this name the email's local part rather than something a person chose? */
function isPlaceholderName(name: string, email: string): boolean {
  return name.trim().toLowerCase() === email.split("@")[0].toLowerCase();
}

/**
 * Both shapes the nonce comes back in.
 *
 * Apple echoes the value the sheet was given, and some clients hash it with
 * SHA-256 before handing it over so the raw value never travels. Which of the
 * two arrives is a property of the plugin and of the iOS version, not of
 * anything decided here, and guessing wrong fails silently with a 401 nobody
 * can read a cause out of.
 *
 * Accepting either costs nothing. Both are derived from the same single-use
 * value this server issued and kept in an httpOnly cookie, so what the nonce
 * is for — a captured token being useless the second time — holds for both.
 */
function noncesMatch(received: string | null, expected: string): boolean {
  if (!received) return false;
  if (received === expected) return true;
  return received === createHash("sha256").update(expected).digest("hex");
}
