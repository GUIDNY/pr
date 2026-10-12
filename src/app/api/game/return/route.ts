import { NextResponse } from "next/server";

// Where a sign-in that started in the 3D mall lands, and the way back to it.
//
// The game sends a signed-out player to /login?redirect=/api/game/return.
// Every sign-in path here — the password form, Google, Apple — accepts
// `redirect` only as a same-site path (it must start with "/" and not "//"),
// which is the open-redirect protection and must stay that way: an absolute
// URL to play.buytoday.co.il would be refused, correctly. So the game's
// address cannot be the destination. This path is, and it forwards.
//
// The address it forwards to is fixed in code and takes nothing from the
// request. That is what keeps this from being the open redirect the login
// checks exist to prevent: there is no parameter here for anybody to aim.
//
// ?signedin=1 tells the game to ask /api/game/profile again. It proves
// nothing and is not meant to; the profile call is what checks the session.
//
// 303 so the browser follows with a GET whatever brought it here, and
// force-dynamic so the redirect is answered per request rather than baked
// into the build as a static response.
export const dynamic = "force-dynamic";

// While the mall is private (lib/mall-access.ts) the way back goes through
// /api/game/pass, which lets only the accounts on the list in.
export function GET(request: Request) {
  const url = new URL(request.url);
  const flags =
    url.searchParams.get("checkout") === "1"
      ? "signedin=1&checkout=1"
      : "signedin=1";
  return NextResponse.redirect(`${url.origin}/api/game/pass?${flags}`, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
