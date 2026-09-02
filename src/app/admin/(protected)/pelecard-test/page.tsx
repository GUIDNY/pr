import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import {
  isPelecardConsoleAvailable,
  isPelecardLiveTest,
  pelecardConfig,
  pelecardEnabled,
  LIVE_TEST_MAX_SHEKELS,
} from "@/lib/pelecard/config";
import { PelecardTestConsole } from "@/components/admin/pelecard-test-console";
import { formatPrice, formatDateTime } from "@/lib/format";

export const metadata = { title: "בדיקות סליקה | A&I Electronics Admin" };
export const dynamic = "force-dynamic";

/**
 * The payment console, in one of two modes.
 *
 * Against the test gateway it forces results and charges nothing. Against the
 * production gateway — which takes four deliberate switches to reach, see
 * isLiveTestConsoleEnabled() — every payment it opens is a real charge on a
 * real card, and the page has to say so before anything else. Without either,
 * it is not hidden or disabled: it does not exist.
 */
export default async function PelecardTestPage() {
  if (!isPelecardConsoleAvailable()) notFound();

  const config = pelecardConfig();
  const liveTest = isPelecardLiveTest();
  const payments = await db.payment.findMany({
    where: { environment: config.environment },
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { order: { select: { orderNumber: true, paymentStatus: true, status: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
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
            הכסף באמת יורד. הסכום המרבי לבדיקה הוא ₪{LIVE_TEST_MAX_SHEKELS}, ואי אפשר לאלץ תוצאה. לזיכוי — דרך
            הפאנל של פלאקארד.
          </p>
        )}
        <p className="mt-1 font-mono text-sm" dir="ltr">
          {config.baseUrl}
        </p>
        <p className="text-muted-foreground mt-1 text-sm">
          מצב הסליקה באתר: {pelecardEnabled() ? "מופעל (PELECARD_ENABLED=true)" : "כבוי — הקופה עדיין בזרימת ההדגמה"}
        </p>
      </div>

      <PelecardTestConsole liveTest={liveTest} maxLiveAmount={LIVE_TEST_MAX_SHEKELS} />

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">
          20 העסקאות האחרונות ({config.environment})
        </h2>
        {payments.length === 0 ? (
          <p className="text-muted-foreground text-sm">עוד לא בוצעו עסקאות בסביבה הזו.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-muted-foreground border-b text-start text-xs">
                <tr>
                  <th className="py-2 text-start">מתי</th>
                  <th className="py-2 text-start">הזמנה</th>
                  <th className="py-2 text-start">סכום</th>
                  <th className="py-2 text-start">סטטוס</th>
                  <th className="py-2 text-start">קוד תשובה</th>
                  <th className="py-2 text-start">מזהה עסקה</th>
                  <th className="py-2 text-start">תשובה מלאה</th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="text-muted-foreground py-2 text-xs whitespace-nowrap">
                      {formatDateTime(payment.createdAt)}
                    </td>
                    <td className="py-2">{payment.order.orderNumber}</td>
                    <td className="py-2 tabular-nums">
                      {formatPrice(payment.amount)}
                      <span className="text-muted-foreground text-xs"> ({payment.amountAgorot} אג׳)</span>
                    </td>
                    <td className="py-2">{payment.status}</td>
                    <td className="py-2 font-mono text-xs">{payment.pelecardStatusCode ?? "—"}</td>
                    <td className="py-2 font-mono text-xs" dir="ltr">
                      {payment.pelecardTransactionId ?? "—"}
                    </td>
                    <td className="py-2">
                      {payment.rawResponse ? (
                        <details>
                          <summary className="text-brand cursor-pointer text-xs">הצג</summary>
                          <pre
                            dir="ltr"
                            className="bg-muted mt-1 max-w-lg overflow-x-auto rounded-md p-2 text-[0.65rem] leading-tight"
                          >
                            {JSON.stringify(payment.rawResponse, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
