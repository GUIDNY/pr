import { getCurrentUser } from "@/lib/auth";
import { gameJson as json, gameOriginAllowed, gamePreflight, readGameBody } from "@/lib/game-api";
import { startTopup } from "@/lib/wallet-topup";

/**
 * Starts a balance top-up: POST { packageId: "p500" | "p1000" | "p5000" }
 * → { redirectUrl, topupId }, and the caller sends the whole window to
 * redirectUrl (Pelecard's form). Afterwards Pelecard returns the customer to
 * /account/wallet?topup=<id>&result=…, and the balance is credited only by
 * /api/pelecard/wallet-callback.
 *
 * The amount comes from the package id, never from the body. Signed-in only.
 * The shop's own pages and the 3D mall may call it (Origin checked — this is
 * a write made with the customer's cookie), with the game's CORS headers.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return gamePreflight("POST, OPTIONS");
}

export async function POST(request: Request) {
  if (!gameOriginAllowed(request)) return json({ error: "forbidden" }, 403);

  const user = await getCurrentUser();
  if (!user) return json({ error: "signed_out" }, 401);

  const raw = await readGameBody(request, 1_000);
  if (raw === null) return json({ error: "too_large" }, 413);
  let packageId: unknown;
  try {
    packageId = (JSON.parse(raw || "{}") as { packageId?: unknown }).packageId;
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const result = await startTopup(user, packageId);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ redirectUrl: result.redirectUrl, topupId: result.topupId });
}
