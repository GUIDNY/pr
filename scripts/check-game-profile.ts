/**
 * The 3D mall's character, and what this shop agrees to keep of it.
 *
 * /api/game/profile stores whatever parseGameProfile returns against a
 * customer's account and replays it to every device they sign in on. The
 * body it parses is written by another site, so the parser is the whole of
 * the defence and this walks its edges: every field's type and range, the
 * name's alphabet and length, extra keys dropped rather than stored, and a
 * missing key refused rather than half-saved.
 *
 * And the first-name rule, which guards something easier to miss: an account
 * made through Google or Apple without a name is stored with the email's
 * local part as a placeholder, and the game must not greet anybody by half
 * of their address.
 *
 * Plus the wiring the contract depends on and a refactor could quietly
 * break: /api/game/return stays a fixed redirect with nothing in the request
 * able to aim it, and every sign-in path keeps accepting a same-site path as
 * its destination — the game sends people to /login?redirect=/api/game/return
 * and nowhere else.
 *
 * No database and no network, like the other checks here.
 *
 *   npm run check:game
 */

import { readFileSync } from "fs";
import { GAME_NAME_MAX, GAME_ORIGIN, gameFirstName, parseGameProfile } from "../src/lib/game-profile";

let failures = 0;

function is(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  const ok = g === w;
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${g}\n          want ${w}`}`);
}

const good = {
  name: "Dana",
  girl: true,
  skin: 0xf1c27d,
  hair: 0x3b2219,
  shirt: 0x44e092,
  pants: 0x1f2a44,
  bottom: "skirt",
  extra: "glasses",
};

console.log("\nA well-formed character is kept exactly");
is("the full shape", parseGameProfile(good), good);
is("colour bounds 0 and 0xFFFFFF", parseGameProfile({ ...good, skin: 0, hair: 0xffffff })?.hair, 0xffffff);
is("an empty name is allowed", parseGameProfile({ ...good, name: "" })?.name, "");
is("a Hebrew name", parseGameProfile({ ...good, name: "דנה לוי" })?.name, "דנה לוי");
is("dot, underscore, hyphen, digits", parseGameProfile({ ...good, name: "d.a_n-a 7" })?.name, "d.a_n-a 7");
is("trimmed before it is measured", parseGameProfile({ ...good, name: "   Dana   " })?.name, "Dana");
is("twelve characters exactly", parseGameProfile({ ...good, name: "a".repeat(GAME_NAME_MAX) })?.name, "a".repeat(12));
is("twelve Hebrew characters", parseGameProfile({ ...good, name: "א".repeat(12) })?.name, "א".repeat(12));

console.log("\nExtra keys are dropped, not stored");
is(
  "a hat and a script are gone",
  parseGameProfile({ ...good, hat: "top", __proto__x: 1, html: "<script>" }),
  good,
);

console.log("\nAnything else is refused");
is("not an object", parseGameProfile("Dana"), null);
is("null", parseGameProfile(null), null);
is("an array", parseGameProfile([good]), null);
for (const key of Object.keys(good)) {
  const partial: Record<string, unknown> = { ...good };
  delete partial[key];
  is(`missing ${key}`, parseGameProfile(partial), null);
}
is("thirteen characters", parseGameProfile({ ...good, name: "a".repeat(13) }), null);
is("markup in the name", parseGameProfile({ ...good, name: "<b>x</b>" }), null);
is("a right-to-left override", parseGameProfile({ ...good, name: "ab‮cd" }), null);
is("a newline", parseGameProfile({ ...good, name: "a\nb" }), null);
is("an emoji", parseGameProfile({ ...good, name: "Dana 😀" }), null);
is("a name that is a number", parseGameProfile({ ...good, name: 7 }), null);
is("girl as a string", parseGameProfile({ ...good, girl: "true" }), null);
is("a colour below zero", parseGameProfile({ ...good, skin: -1 }), null);
is("a colour above 0xFFFFFF", parseGameProfile({ ...good, shirt: 0x1000000 }), null);
is("a fractional colour", parseGameProfile({ ...good, hair: 1.5 }), null);
is("a colour as a hex string", parseGameProfile({ ...good, pants: "#ffffff" }), null);
is("NaN", parseGameProfile({ ...good, skin: NaN }), null);
is("an unknown bottom", parseGameProfile({ ...good, bottom: "shorts" }), null);
is("an unknown extra", parseGameProfile({ ...good, extra: "crown" }), null);

console.log("\nThe first name is never an email");
is("first word of the account name", gameFirstName("Dana Levi", "dana@example.com"), "Dana");
is("a Hebrew name", gameFirstName("  דנה   לוי ", "x@example.com"), "דנה");
is("the email's local part is a placeholder", gameFirstName("dana.levi84", "dana.levi84@gmail.com"), null);
is("case does not hide it", gameFirstName("Dana.Levi84", "dana.levi84@gmail.com"), null);
is("anything with an @", gameFirstName("dana@x.com", "other@example.com"), null);
is("empty", gameFirstName("   ", "dana@example.com"), null);
is("null", gameFirstName(null, "dana@example.com"), null);

console.log("\nThe wiring the game depends on");
is("the game's origin is exact", GAME_ORIGIN, "https://play.buytoday.co.il");

const returnRoute = readFileSync("src/app/api/game/return/route.ts", "utf8");
is(
  "/api/game/return redirects to a fixed address",
  /NextResponse\.redirect\(`\$\{GAME_ORIGIN\}\/\?signedin=1`/.test(returnRoute),
  true,
);
is("/api/game/return reads nothing from the request", /export function GET\(\)/.test(returnRoute), true);

/* The same-site rule every web sign-in path applies to `redirect`. If one of
   them changes it — to an allow-list of pages, say — the game's sign-in
   silently starts landing on /account, so the check is on the source. */
const SAME_SITE = 'requested && requested.startsWith("/") && !requested.startsWith("//") ? requested : "/account"';
for (const file of ["src/app/api/auth/google/route.ts", "src/app/api/auth/apple/route.ts"]) {
  is(`${file} accepts a same-site path`, readFileSync(file, "utf8").includes(SAME_SITE), true);
}
const loginForm = readFileSync("src/components/auth/login-form.tsx", "utf8");
is(
  "the password form leaves for /api/ destinations with a full navigation",
  /redirectTo\.startsWith\("\/api\/"\)\)\s*\{\s*window\.location\.assign\(redirectTo\)/.test(loginForm),
  true,
);

const profileRoute = readFileSync("src/app/api/game/profile/route.ts", "utf8");
is("GET, PUT and OPTIONS are all exported", ["GET", "PUT", "OPTIONS"].every((m) => profileRoute.includes(`export async function ${m}(`)), true);
is("what is stored is the parsed profile", /create: \{ userId: session\.sub, profile \}/.test(profileRoute), true);

console.log(failures ? `\n${failures} check(s) failed.\n` : "\nAll checks passed.\n");
process.exit(failures ? 1 : 0);
