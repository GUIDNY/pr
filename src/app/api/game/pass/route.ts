import { NextResponse } from "next/server";
import { GAME_ORIGIN } from "@/lib/game-profile";
import {
  MALL_PASS_COOKIE,
  MALL_PASS_TTL_SECONDS,
  signMallPass,
} from "@/lib/mall-access";
import { mallViewerEmail } from "@/lib/mall-access-server";

// The one way into the private 3D mall (see lib/mall-access.ts).
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
  const home = NextResponse.redirect(`${url.origin}/`, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });

  const email = await mallViewerEmail();
  if (!email) return home;
  const pass = await signMallPass(email);
  if (!pass) return home;

  const flags = new URLSearchParams();
  if (url.searchParams.get("signedin") === "1") flags.set("signedin", "1");
  if (url.searchParams.get("checkout") === "1") flags.set("checkout", "1");
  const ua = request.headers.get("user-agent") ?? "";
  // ?inapp=1: sent here by /mall itself (proxy.ts), which only the app opens
  const inApp =
    url.searchParams.get("inapp") === "1" ||
    ua.includes(APP_UA_MARKER) ||
    ANDROID_WEBVIEW.test(ua);

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
