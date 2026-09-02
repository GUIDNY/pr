"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSandboxTestOrderAction, lookupTransactionAction } from "@/actions/pelecard-test";

/* QAResultStatus makes Pelecard return exactly the code you ask for, which is
   how the failure paths get tested without hunting for a card that declines.
   The server action behind this refuses to run outside the sandbox. */
const RESULTS = [
  { code: "000", label: "הצלחה" },
  { code: "006", label: "CVV שגוי" },
  { code: "033", label: "כרטיס פסול" },
  { code: "036", label: "כרטיס פג תוקף" },
  { code: "301", label: "Timeout" },
];

const TEST_CARD = "458045804580";

export function PelecardTestConsole({
  liveTest = false,
  maxLiveAmount = 5,
}: {
  liveTest?: boolean;
  maxLiveAmount?: number;
}) {
  const [amount, setAmount] = useState(liveTest ? "1.00" : "149.90");
  const [qaResultStatus, setQaResultStatus] = useState("000");
  const [confirmation, setConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();

  /* Against the production gateway this button spends real money, so it is not
     something a stray click should be able to do. Typing the word is the
     smallest barrier that cannot be crossed by accident. */
  const CONFIRM_WORD = "לחייב";
  const armed = !liveTest || confirmation.trim() === CONFIRM_WORD;

  function run() {
    startTransition(async () => {
      const result = await createSandboxTestOrderAction(Number(amount), qaResultStatus);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה ביצירת בדיקה");
        return;
      }
      window.location.href = result.redirectUrl;
    });
  }

  return (
    <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5">
      <h2 className="font-semibold">{liveTest ? "הרצת עסקה אמיתית לבדיקה" : "הרצת עסקת בדיקה"}</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="test-amount" className="mb-1.5">
            סכום לבדיקה (₪)
          </Label>
          <Input
            id="test-amount"
            type="number"
            step="0.01"
            min="0.1"
            max={liveTest ? maxLiveAmount : undefined}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <p className="text-muted-foreground mt-1 text-xs">
            נשלח לפלאקארד באגורות: {Number.isFinite(Number(amount)) ? Math.round(Number(amount) * 100) : "—"}
          </p>
        </div>

        <div className={liveTest ? "hidden" : undefined}>
          <Label htmlFor="test-result" className="mb-1.5">
            תוצאה לאלץ (QAResultStatus)
          </Label>
          <select
            id="test-result"
            value={qaResultStatus}
            onChange={(e) => setQaResultStatus(e.target.value)}
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
          >
            {RESULTS.map((r) => (
              <option key={r.code} value={r.code}>
                {r.code} — {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        className={`bg-muted flex flex-wrap items-center gap-2 rounded-lg p-3 text-sm ${liveTest ? "hidden" : ""}`}
      >
        <span className="font-medium">כרטיס בדיקה:</span>
        <code dir="ltr" className="font-mono">
          {TEST_CARD}
        </code>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1"
          onClick={() => {
            void navigator.clipboard.writeText(TEST_CARD);
            toast.success("הועתק");
          }}
        >
          <Copy className="size-3.5" />
          העתקה
        </Button>
        <span className="text-muted-foreground text-xs">תוקף: כל תאריך עתידי (MMYY) · CVV: כל 3 ספרות</span>
      </div>

      {liveTest && (
        <div className="border-destructive/40 bg-destructive/10 rounded-lg border p-3">
          <p className="mb-2 text-sm leading-relaxed">
            העסקה הבאה תחייב <strong>כרטיס אשראי אמיתי</strong> בסכום שלמעלה, עד ₪{maxLiveAmount}. השתמשו בכרטיס
            שלכם. לזיכוי — דרך הפאנל של פלאקארד.
          </p>
          <Label htmlFor="live-confirm" className="mb-1.5">
            להמשך, הקלידו: <span className="font-bold">{CONFIRM_WORD}</span>
          </Label>
          <Input
            id="live-confirm"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className="max-w-40"
          />
        </div>
      )}

      <Button
        variant={liveTest ? "destructive" : "brand"}
        onClick={run}
        disabled={isPending || !armed}
        className="self-start"
      >
        {isPending
          ? "פותח עסקה..."
          : liveTest
            ? `חיוב אמיתי של ₪${amount} ומעבר לסליקה`
            : "יצירת הזמנת בדיקה ומעבר לסליקה"}
      </Button>

      <TransactionLookup />
    </div>
  );
}

/**
 * Pelecard's own reports only list transactions that were transmitted to the
 * card companies, and a sandbox transaction never is — so a payment made here
 * cannot be found in their UI even though it exists on their side. This asks
 * them directly.
 *
 * The id is on the payment row in the table below, and also in the address of
 * their payment page (…/PaymentGW?transactionId=…).
 */
function TransactionLookup() {
  const [transactionId, setTransactionId] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function lookup() {
    setResult(null);
    startTransition(async () => {
      const response = await lookupTransactionAction(transactionId);
      if (!response.success) {
        toast.error(response.error ?? "השליפה נכשלה");
        return;
      }
      setResult(JSON.stringify(response.transaction, null, 2));
    });
  }

  return (
    <div className="border-border mt-2 border-t pt-4">
      <h3 className="mb-1 font-semibold">שליפת עסקה מפלאקארד</h3>
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">
        עסקאות סנדבוקס לא מופיעות במערכת הדוחות של פלאקארד, כי הן לא משודרות לחברות האשראי. זו הדרך לראות מה הם
        יודעים על עסקה: מדביקים את מזהה העסקה ומקבלים את התשובה שלהם כמו שהיא.
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[320px] flex-1">
          <Label htmlFor="txn-id" className="mb-1.5">
            מזהה עסקה (PelecardTransactionId)
          </Label>
          <Input
            id="txn-id"
            dir="ltr"
            placeholder="704e33fb-f044-4a60-b887-0aee71b2f294"
            value={transactionId}
            onChange={(e) => setTransactionId(e.target.value)}
            className="font-mono text-sm"
          />
        </div>
        <Button variant="outline" onClick={lookup} disabled={isPending || !transactionId.trim()}>
          {isPending ? "שולף..." : "שליפה"}
        </Button>
      </div>
      {result && (
        <pre
          dir="ltr"
          className="bg-muted mt-3 max-h-96 overflow-auto rounded-lg p-3 text-xs leading-relaxed"
        >
          {result}
        </pre>
      )}
    </div>
  );
}
