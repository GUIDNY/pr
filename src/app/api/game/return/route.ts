import { NextResponse } from "next/server";
import { GAME_ORIGIN } from "@/lib/game-profile";

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

export function GET() {
  return NextResponse.redirect(`${GAME_ORIGIN}/?signedin=1`, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
