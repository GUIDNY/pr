import { getCurrentUser } from "@/lib/auth";
import { gameJson as json, gamePreflight } from "@/lib/game-api";
import { paymentLaneFor } from "@/lib/pelecard/config";
import { absoluteUrl } from "@/lib/site-url";
import { WALLET_PACKAGES, walletBalanceAgorot, walletEnabled } from "@/lib/wallet";

/**
 * The BuyToday balance, for the shop's own pages and for the 3D mall.
 *
 * Called by play.buytoday.co.il with `credentials: "include"`, under the
 * same CORS rule as every /api/game/* route (lib/game-api.ts): exactly the
 * game's origin, never "*", never a reflected Origin, never cached. Read
 * only — topping up goes through POST /api/wallet/topup, and the money is
 * shekels for products, unrelated to the game's coins.
 *
 *   { enabled: false }                         the feature is off
 *   { enabled: true, signedIn: false }         nobody to show a balance for
 *   { enabled: true, signedIn: true, balanceAgorot, balance, canTopUp,
 *     packages: [{ id, paid, credit, bonus }], walletUrl }
 *
 * Amounts in `balance` and the packages are shekels; balanceAgorot is the
 * exact integer.
 */
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return gamePreflight("GET, OPTIONS");
}

export async function GET() {
  if (!walletEnabled()) return json({ enabled: false });

  const user = await getCurrentUser();
  if (!user) return json({ enabled: true, signedIn: false });

  const balanceAgorot = await walletBalanceAgorot(user.id);
  return json({
    enabled: true,
    signedIn: true,
    balanceAgorot,
    balance: balanceAgorot / 100,
    canTopUp: paymentLaneFor({ email: user.email, role: user.role }) === "gateway",
    packages: WALLET_PACKAGES.map((p) => ({
      id: p.id,
      paid: p.paidAgorot / 100,
      credit: p.creditAgorot / 100,
      bonus: (p.creditAgorot - p.paidAgorot) / 100,
    })),
    walletUrl: absoluteUrl("/account/wallet"),
  });
}
