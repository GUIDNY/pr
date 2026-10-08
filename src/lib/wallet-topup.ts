import "server-only";
import { db } from "@/lib/db";
import { initPayment, SUPPORTED_CARDS, paymentPageStyle } from "@/lib/pelecard/client";
import { pelecardConfig, paymentLaneFor, siteUrl, callbackSecret } from "@/lib/pelecard/config";
import { walletEnabled, walletPackage } from "@/lib/wallet";

/**
 * Opens a Pelecard payment for a balance top-up and hands back the address of
 * their payment form. The top-up counterpart of openPelecardPayment(), built
 * the same way and on the same client, with three differences that matter:
 *
 *   - The amount is the package's, fixed in code and chosen by id. Nothing a
 *     browser sends can name a price.
 *   - Always J4, a charge — never J5, whatever PELECARD_HOLD_THEN_CAPTURE
 *     says. A hold is money not yet collected, and crediting a spendable
 *     balance against it would hand out goods for money that may never
 *     arrive. If the terminal will only do J5, top-ups fail at init, which is
 *     the right direction to fail in.
 *   - Its own callback, /api/pelecard/wallet-callback, so the order callback
 *     never has to guess whether a notification is about an order or a
 *     top-up.
 *
 * Signed-in only, and only on the gateway lane (paymentLaneFor): an account
 * on the demo lane — every back-office role among them — cannot buy balance
 * at all, because there is no such thing as a demo shekel.
 */
export type StartTopupResult =
  | { ok: true; redirectUrl: string; topupId: string }
  | { ok: false; status: number; error: string };

/* An abandoned form leaves a PENDING row behind, which is harmless; a script
   opening hundreds of them is not, so a customer may have only a few open. */
const MAX_PENDING_PER_HOUR = 5;

export async function startTopup(
  user: { id: string; email: string; name: string; phone: string | null; role: string },
  packageId: unknown,
): Promise<StartTopupResult> {
  if (!walletEnabled()) return { ok: false, status: 404, error: "wallet disabled" };

  const pkg = walletPackage(packageId);
  if (!pkg) return { ok: false, status: 400, error: "unknown package" };

  if (paymentLaneFor({ email: user.email, role: user.role }) !== "gateway") {
    return { ok: false, status: 503, error: "card payment is not available for this account" };
  }

  let config;
  let site;
  let secret;
  try {
    config = pelecardConfig();
    site = siteUrl();
    secret = callbackSecret();
  } catch (error) {
    console.error("[wallet] pelecard configuration refused", error);
    return { ok: false, status: 503, error: "payment not configured" };
  }

  /* The sandbox approves test cards, and a balance is spendable on real goods
     in the real database. Orders tolerate the sandbox because a sandbox order
     still has to be packed by a person who can see it is a test; a balance is
     just a number that buys things. So the live deployment never credits one
     from the test gateway. */
  if (config.isSandbox && process.env.VERCEL_ENV === "production") {
    return { ok: false, status: 503, error: "sandbox top-ups are refused in production" };
  }

  const recent = await db.walletTopup.count({
    where: { userId: user.id, status: "PENDING", createdAt: { gte: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= MAX_PENDING_PER_HOUR) return { ok: false, status: 429, error: "too many open top-ups" };

  const topup = await db.walletTopup.create({
    data: { userId: user.id, packageId: pkg.id, paidAgorot: pkg.paidAgorot, creditAgorot: pkg.creditAgorot, environment: config.environment },
  });

  const callback = `${site}/api/pelecard/wallet-callback?secret=${encodeURIComponent(secret)}&topup=${topup.id}`;
  const returnTo = (result: string) => `${site}/account/wallet?topup=${topup.id}&result=${result}`;

  let result;
  try {
    result = await initPayment({
      ActionType: "J4",
      Currency: "1", // ILS
      Total: String(pkg.paidAgorot),
      FreeTotal: "False",
      GoodURL: returnTo("success"),
      ErrorURL: returnTo("error"),
      CancelURL: returnTo("cancelled"),
      ServerSideGoodFeedbackURL: callback,
      ServerSideErrorFeedbackURL: `${callback}&failed=1`,
      ServerSideFeedbackContentType: "application/json",
      FeedbackDataTransferMethod: "POST",
      ParamX: topup.id,
      UserKey: topup.id,
      Language: "HE",
      AccessibilityMode: "True",
      // The same field choices as the order form — see open-payment.ts for
      // why they are filled rather than hidden (bit needs the phone).
      Cvv2Field: "must",
      CustomerIdField: "Hide",
      CardHolderName: user.name || "Hide",
      EmailField: user.email || "Hide",
      TelField: user.phone || "Hide",
      MaxPayments: 1,
      MinPayments: 1,
      FirstPayment: "auto",
      ShopNo: "001",
      UseLuhnAlgorithm: "True",
      SupportedCards: SUPPORTED_CARDS,
      TakeIshurPopUp: "False",
      ...paymentPageStyle(),
    });
  } catch (error) {
    console.error("[wallet] init threw", { topupId: topup.id, error });
    await db.walletTopup.update({ where: { id: topup.id }, data: { status: "FAILED", rawResponse: { initError: String(error) } } });
    return { ok: false, status: 502, error: "payment init failed" };
  }

  const errCode = result.Error?.ErrCode;
  if (!result.URL || !result.ConfirmationKey || (errCode !== 0 && errCode !== "0" && errCode !== undefined)) {
    console.error("[wallet] init failed", { topupId: topup.id, error: result.Error });
    await db.walletTopup.update({ where: { id: topup.id }, data: { status: "FAILED", rawResponse: { init: result } as object } });
    return { ok: false, status: 502, error: result.Error?.ErrMsg ?? "payment init failed" };
  }

  await db.walletTopup.update({ where: { id: topup.id }, data: { confirmationKey: result.ConfirmationKey } });
  return { ok: true, redirectUrl: result.URL, topupId: topup.id };
}
