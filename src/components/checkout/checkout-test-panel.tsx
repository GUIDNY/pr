"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, CreditCard, ClipboardList, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createTestPaymentOrderAction } from "@/actions/checkout-test";

/**
 * The staff-only panel at the top of checkout, and the reason it exists is that
 * the two halves of this flow have to be worked on separately.
 *
 * The payment page is Pelecard's, and the only way to see the real one is to
 * make a real charge — their test gateway cannot complete a transaction against
 * this terminal. So one button opens a ₪1 transaction against the live terminal
 * and goes straight to the payment step.
 *
 * Everything around the payment — the form, the validation, the confirmation,
 * the order that comes out the other end — needs no gateway at all, and the
 * shop already has a lane for it: DEMO_CARD. The other button fills the form
 * with details that pass validation so that lane can be run in one press,
 * through the real code path rather than around it.
 *
 * Rendered only for ADMIN and STAFF, and the server action checks the session
 * again for itself — a component that decides who may charge a card is a
 * component one `curl` away from being wrong.
 */
export function CheckoutTestPanel({ onFillTestDetails }: { onFillTestDetails: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [filled, setFilled] = useState(false);

  function openRealPayment() {
    startTransition(async () => {
      const result = await createTestPaymentOrderAction();
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.push(`/checkout/pay/${encodeURIComponent(result.orderNumber)}`);
    });
  }

  return (
    <section className="rounded-xl border border-dashed border-amber-400 bg-amber-50/60 p-4 dark:bg-amber-950/20">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
        <FlaskConical className="size-4" aria-hidden />
        מצב בדיקה — גלוי רק לצוות
      </h2>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          className="flex-1 justify-center gap-2 border-amber-300 bg-white"
          onClick={openRealPayment}
          disabled={isPending}
        >
          {isPending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <CreditCard className="size-4" aria-hidden />
          )}
          דף תשלום אמיתי — ₪1
        </Button>

        <Button
          type="button"
          variant="outline"
          className="flex-1 justify-center gap-2 border-amber-300 bg-white"
          onClick={() => {
            onFillTestDetails();
            setFilled(true);
          }}
        >
          <ClipboardList className="size-4" aria-hidden />
          {filled ? "הפרטים מולאו — אפשר לשלוח" : "הזמנת דמה — מלא פרטים"}
        </Button>
      </div>

      <ul className="mt-3 flex flex-col gap-1 text-xs text-amber-900/80 dark:text-amber-200/80">
        <li>
          <strong>דף תשלום אמיתי</strong> פותח עסקה מול המסוף החי. זה{" "}
          <strong>חיוב אמיתי של שקל</strong> על כרטיס אמיתי, וההזמנה נושאת <code>TEST-</code> במספר
          שלה.
        </li>
        <li>
          <strong>הזמנת דמה</strong> ממלאת את הטופס בפרטי בדיקה ובוחרת כרטיס דמה — אין סליקה, אין
          חיוב, וההזמנה עוברת בדיוק באותו מסלול שהלקוח עובר.
        </li>
        <li>לקוחות אינם רואים את הפאנל הזה ואינם משלמים בכרטיס עד ש-PELECARD_ENABLED יידלק.</li>
      </ul>
    </section>
  );
}
