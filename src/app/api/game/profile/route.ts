import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { SITE_URL } from "@/lib/site-url";
import { GAME_ORIGIN, GAME_PROFILE_MAX_BYTES, gameFirstName, parseGameProfile } from "@/lib/game-profile";

// The 3D mall's window onto a BuyToday account.
//
// The game lives at play.buytoday.co.il, a static site on another origin with
// no server of its own. A shopper who is signed in here should find their
// character (the figure and the name above its head) waiting for them on any
// device, so the character is stored against their account and this is the
// one place the game reads and writes it. Nothing else about the account is
// reachable from here: not the email, not orders, not the cart. First name
// and the character, and that is the whole surface.
//
// WHY A CROSS-ORIGIN FETCH WORKS AT ALL. The game calls this with
// `credentials: "include"`. play.buytoday.co.il and buytoday.co.il are
// different origins but the same *site* (same registrable domain), and
// SameSite is about sites: prec_session is SameSite=Lax, so the browser
// attaches it to a same-site fetch exactly as it would to a same-origin one.
// No cookie change was needed and none was made — prec_session stays
// host-only on buytoday.co.il and httpOnly, so the game never sees it; it
// only ever sees the answers below.
//
// Call buytoday.co.il, never www. www answers every path with a 308 to the
// bare domain, and a redirect in the middle of a CORS preflight fails it.
//
// CORS names one origin, exactly. `Access-Control-Allow-Origin: *` cannot be
// combined with credentials by design, and reflecting whatever Origin arrived
// would hand any page on the internet a signed-in visitor's first name. So
// the header is the game's address whatever was asked, and a browser on any
// other origin simply refuses to show its page the response.
//
// CSRF. CORS only stops another page *reading* a response; it does not stop
// the request being sent. A PUT with a JSON body is preflighted, which already
// keeps other origins out, but that is a property of how browsers behave today
// rather than a rule this route enforces. The Origin check on PUT is the rule:
// the game, or this site itself, and nobody else gets to change a
// customer's character with the customer's own cookie.
//
// Personal, so never cached: no-store on every answer, and Vary: Origin so no
// shared cache in between could hand one origin's CORS answer to another.
export const dynamic = "force-dynamic";

function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": GAME_ORIGIN,
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
    "Cache-Control": "no-store",
  };
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: corsHeaders() });
}

/**
 * Is this write coming from a page allowed to make it?
 *
 * The game, or the shop itself. The shop is named twice — its configured
 * address and the address this request actually reached — because on a
 * preview deployment those differ, and a same-origin call from a preview
 * page is not a cross-site forgery. A browser does not let a page lie about
 * its own Origin header, and a request with no Origin at all is refused:
 * every browser sends one on a cross-origin PUT, so its absence means this
 * was not a page asking.
 */
function originAllowed(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  if (origin === GAME_ORIGIN) return true;
  return origin === new URL(SITE_URL).origin || origin === new URL(request.url).origin;
}

/**
 * The body, read no further than the limit.
 *
 * Content-Length is checked first because it is free, but it is a claim the
 * sender makes, and a chunked body carries none. So the stream is read with
 * a running count and abandoned the moment it passes the limit — a large body
 * costs this function a couple of kilobytes, not whatever was sent.
 */
async function readLimited(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > GAME_PROFILE_MAX_BYTES) return null;
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > GAME_PROFILE_MAX_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** The preflight for PUT. Answered for any origin; only the game's is named. */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...corsHeaders(),
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    },
  });
}

/**
 * Who is playing, and what they look like.
 *
 * Signed out is a normal answer and not an error — it is most visitors, and
 * the game shows them its guest flow. firstName goes through gameFirstName,
 * which refuses to pass off an email handle as a name. The stored profile is
 * put back through the parser on the way out as well as on the way in: it
 * costs nothing, and a row written by something other than this route — a
 * hand edit, a future version of the rules — reaches the game as "no
 * character yet" rather than as whatever it happens to contain.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return json({ signedIn: false });

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { name: true, email: true, gameProfile: { select: { profile: true } } },
  });
  if (!user) return json({ signedIn: false });

  return json({
    signedIn: true,
    firstName: gameFirstName(user.name, user.email),
    profile: user.gameProfile ? parseGameProfile(user.gameProfile.profile) : null,
  });
}

/**
 * Save the character.
 *
 * The order of the checks is the order of what is cheapest to refuse: a
 * foreign origin before anything is read, no session before the body is, and
 * the body last. What is stored is what parseGameProfile rebuilt, never what
 * arrived — see lib/game-profile.ts for why that distinction is the point.
 */
export async function PUT(request: Request) {
  if (!originAllowed(request)) return json({ error: "forbidden" }, 403);

  const session = await getSession();
  if (!session) return json({ signedIn: false }, 401);

  // Requiring JSON is also what makes this a preflighted request: a form on
  // another site can post text/plain without asking, and cannot post this.
  const type = request.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) return json({ error: "bad_request" }, 400);

  const raw = await readLimited(request);
  if (raw === null) return json({ error: "too_large" }, 413);

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const profile = parseGameProfile(
    typeof body === "object" && body !== null ? (body as { profile?: unknown }).profile : undefined,
  );
  if (!profile) return json({ error: "invalid_profile" }, 400);

  await db.gameProfile.upsert({
    where: { userId: session.sub },
    create: { userId: session.sub, profile },
    update: { profile },
  });

  return json({ ok: true });
}
