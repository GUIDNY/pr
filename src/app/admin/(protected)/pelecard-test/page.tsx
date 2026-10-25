import { requireCatalogPage } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  isPelecardConsoleAvailable,
  isPelecardLiveTest,
  pelecardConfig,
  diagnosePelecard,
  LIVE_TEST_MAX_SHEKELS,
} from "@/lib/pelecard/config";
import { PelecardStatus } from "@/components/admin/pelecard-status";
import { PelecardReconcilePanel } from "@/components/admin/pelecard-reconcile-panel";
import { PelecardPayments } from "@/components/admin/pelecard-payments";
import { stuckGatewayOrders } from "@/actions/pelecard-reconcile";
import { PelecardTestConsole } from "@/components/admin/pelecard-test-console";

export const metadata = { title: "סליקה | Buy Today Admin" };
export const dynamic = "force-dynamic";

/**
 * The payments screen, and — only where it can exist — the test console.
 *
 * The console forces results against the test gateway and charges nothing;
 * against the production gateway it takes four deliberate switches to reach
 * and every payment it opens is a real charge, so it says so before anything
 * else. Without either it does not exist, and that is correct.
 *
 * WHAT WAS WRONG WITH THAT: everything else on the page was behind the same
 * gate. The function returned early whenever the console was unavailable, and
 * on the live site it always is, by design — so the list of transactions was
 * rendered on exactly the deployments where no transactions happen, and hidden
 * on the one where a customer rings up asking whether her card went through.
 * The answer was in the database the whole time.
 *
 * So the order here is the order of the questions: what the gateway is doing
 * (status), which orders never got an answer (stuck), what it has answered
 * (payments), and last, if it exists at all, the console.
 */
export default async function PelecardPage() {
  await requireCatalogPage();

  const diagnosis = diagnosePelecard();
  const consoleAvailable = isPelecardConsoleAvailable();

  /* Not filtered by environment, which is what used to tie this query to a
     config call that throws when credentials are missing — the page then
     failed in exactly the state it exists to explain. Every row carries its
     own environment and the live site has only ever written one. */
  const [stuck, payments] = await Promise.all([
    stuckGatewayOrders(),
    db.payment.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { order: { select: { orderNumber: true, paymentStatus: true, status: true } } },
    }),
  ]);

  const liveTest = consoleAvailable && isPelecardLiveTest();

  return (
    <div className="flex flex-col gap-6">
      <PelecardStatus diagnosis={diagnosis} />
      <PelecardReconcilePanel orders={stuck} />
      <PelecardPayments payments={payments} />

      {consoleAvailable && (
        <>
          <div
            className={
              liveTest
                ? "border-destructive bg-destructive/15 rounded-xl border-2 p-4"
                : "border-warning bg-warning/15 rounded-xl border-2 p-4"
            }
          >
            <p className="text-lg font-bold">
              {liveTest
                ? "⚠️ פלאקארד — שרת אמיתי. כל עסקה כאן היא חיוב אמיתי בכרטיס אמיתי."
                : "PELECARD SANDBOX — לא מתבצעים חיובים אמיתיים"}
            </p>
            {liveTest && (
              <p className="mt-1 text-sm font-semibold">
                הכסף באמת יורד. הסכום המרבי לבדיקה הוא ₪{LIVE_TEST_MAX_SHEKELS}, ואי אפשר לאלץ תוצאה. לזיכוי —
                דרך הפאנל של פלאקארד.
              </p>
            )}
            <p className="mt-1 font-mono text-sm" dir="ltr">
              {pelecardConfig().baseUrl}
            </p>
          </div>

          <PelecardTestConsole liveTest={liveTest} maxLiveAmount={LIVE_TEST_MAX_SHEKELS} />
        </>
      )}
    </div>
  );
}
