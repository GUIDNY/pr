import { NextResponse } from "next/server";
import { GAME_ORIGIN } from "@/lib/game-profile";
import {
  MALL_PASS_COOKIE,
  MALL_PASS_TTL_SECONDS,
  signMallPass,
} from "@/lib/mall-access";
import { mallViewerEmail } from "@/lib/mall-access-server";

// The team's pass for the 3D mall (see lib/mall-access.ts); since the mall
// opened to everyone on 10 November it unlocks only the face scan.
//
// play.buytoday.co.il sends anyone without a pass here. A signed-in account
// on the list is sent back with a fresh pass, which the game's host turns
// into its own cookie; everyone else — signed out, or any other account —
// lands on the shop's home page and is told nothing.
//
// Both destinations are fixed in code; the only thing taken from the request
// is the one-value checkout flag, so this is not a redirect anybody can aim.
export const dynamic = "force-dynamic";

const APP_UA_MARKER = "BuyTodayApp";
const ANDROID_WEBVIEW = /; wv\)/;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const flags = new URLSearchParams();
  if (url.searchParams.get("signedin") === "1") flags.set("signedin", "1");
  if (url.searchParams.get("checkout") === "1") flags.set("checkout", "1");
  const ua = request.headers.get("user-agent") ?? "";
  // ?inapp=1: sent here by /mall itself (proxy.ts), which only the app opens
  const inApp =
    url.searchParams.get("inapp") === "1" ||
    ua.includes(APP_UA_MARKER) ||
    ANDROID_WEBVIEW.test(ua);

  // The mall is open to everyone since 10 November, so a customer who signed
  // in from inside it goes back to it, without a pass: the pass is now only
  // what the game's face scan asks for, and that stays with the team. Before,
  // everyone off the list was sent to the shop's home page, which threw a
  // customer out of the mall the moment they signed in. The game reads the
  // account itself (/api/game/profile), not the pass.
  const q0 = flags.toString();
  const back = NextResponse.redirect(
    inApp ? `${url.origin}/mall${q0 ? `?${q0}` : ""}` : `${GAME_ORIGIN}/${q0 ? `?${q0}` : ""}`,
    { status: 303, headers: { "Cache-Control": "no-store" } },
  );

  const email = await mallViewerEmail();
  if (!email) return back;
  const pass = await signMallPass(email);
  if (!pass) return back;

  // Inside the app the mall is /mall on this host; elsewhere its own address,
  // which takes the pass once and keeps it as its own cookie.
  const q = flags.toString();
  const destination = inApp
    ? `${url.origin}/mall?passed=1${q ? `&${q}` : ""}`
    : `${GAME_ORIGIN}/__pass?t=${encodeURIComponent(pass)}${q ? `&${q}` : ""}`;
  const res = NextResponse.redirect(destination, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
  // /mall on this host reads the same pass (proxy.ts)
  res.cookies.set(MALL_PASS_COOKIE, pass, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MALL_PASS_TTL_SECONDS,
  });
  return res;
}
