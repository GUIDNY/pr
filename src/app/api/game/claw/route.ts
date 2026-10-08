import { getSession } from "@/lib/auth";
import { CLAW_CAMPAIGN, clawPlay, clawStatus } from "@/lib/game-claw";
import { gameJson as json, gameOriginAllowed, gamePreflight } from "@/lib/game-api";

// The 3D mall's prize machine for a signed-in customer: one free play a day,
// counted here. Rules and reasons in lib/game-claw.ts. A guest's day stays in the game.
//
//   GET  → whether today's play is taken, how many plays in all, and a running campaign's rules link
//   POST → take today's play (a second POST the same day returns fresh: false)
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return gamePreflight("GET, POST, OPTIONS");
}

export async function GET() {
  const session = await getSession();
  return json({ signedIn: !!session, campaign: CLAW_CAMPAIGN ? { label: CLAW_CAMPAIGN.label, rulesUrl: CLAW_CAMPAIGN.rulesUrl, to: CLAW_CAMPAIGN.to } : null, status: session ? await clawStatus(session.sub) : null });
}

export async function POST(request: Request) {
  if (!gameOriginAllowed(request)) return json({ error: "forbidden" }, 403);
  const session = await getSession();
  if (!session) return json({ signedIn: false }, 401);
  return json({ signedIn: true, ...(await clawPlay(session.sub)) });
}
