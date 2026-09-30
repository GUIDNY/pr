import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { GAME_PROFILE_MAX_BYTES, gameFirstName, parseGameProfile } from "@/lib/game-profile";
import { parseGameProgress } from "@/lib/game-progress";
import { gameJson as json, gameOriginAllowed as originAllowed, gamePreflight, readGameBody } from "@/lib/game-api";

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

/** The preflight for PUT. */
export async function OPTIONS() {
  return gamePreflight("GET, PUT, OPTIONS");
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
    select: { name: true, email: true, gameProfile: { select: { profile: true, progress: true } } },
  });
  if (!user) return json({ signedIn: false });

  return json({
    signedIn: true,
    firstName: gameFirstName(user.name, user.email),
    profile: user.gameProfile ? parseGameProfile(user.gameProfile.profile) : null,
    progress: user.gameProfile?.progress ? parseGameProgress(user.gameProfile.progress) : null,
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

  const raw = await readGameBody(request, GAME_PROFILE_MAX_BYTES);
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

  // The progress rides along when the game has any; it is optional, and a
  // malformed one is refused as a whole rather than half-stored.
  const rawProgress = typeof body === "object" && body !== null ? (body as { progress?: unknown }).progress : undefined;
  const progress = rawProgress === undefined ? undefined : parseGameProgress(rawProgress);
  if (progress === null) return json({ error: "invalid_progress" }, 400);

  await db.gameProfile.upsert({
    where: { userId: session.sub },
    create: { userId: session.sub, profile, ...(progress ? { progress } : {}) },
    update: { profile, ...(progress ? { progress } : {}) },
  });

  return json({ ok: true });
}
