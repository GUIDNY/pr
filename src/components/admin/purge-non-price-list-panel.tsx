"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, Trash2, X } from "lucide-react";
import { purgeNonPriceListProductsAction, type PurgeResult, type PurgeTarget } from "@/actions/inventory-purge";

/**
 * The button that enforces "the only source is the price lists", and the two
 * presses it takes.
 *
 * It deletes products and that cannot be undone, so the panel spells out
 * what will go — how many records, how many photographs, how much
 * hand-written content — before either press, and says plainly that nothing
 * was ever ordered. Two presses with the consequence written between them,
 * rather than a dialog that asks "are you sure" and teaches people to press
 * yes. Same shape as the price sheet's confirm, for the same reason.
 *
 * Hidden entirely when there is nothing to remove, which is the state this
 * is meant to reach and stay in.
 */
/** The two things the panel can be asked to remove, in the owner's words. */
const COPY: Record<
  PurgeTarget,
  { heading: (n: number) => string; body: string; what: (r: PurgeResult) => string }
> = {
  NO_PRICE_LIST: {
    heading: (n) => `${n.toLocaleString("he-IL")} מוצרים בקטלוג ללא מחירון`,
    body:
      "הם הגיעו ממקורות גוגל-שיטס שכובו באוגוסט. שום סנכרון לא יעדכן אותם — לא מלאי ולא מחיר — והם כבר מוסרים " +
      "מהאתר, מהפיד ומהחיפוש. תחת הכלל שהמקור היחיד הוא המחירונים, אין להם מה לעשות בקטלוג.",
    what: (r) =>
      `המחיקה תסיר ${r.products} רשומות, ${r.images} תמונות ו-${r.enriched} מוצרים עם תיאור ומפרט שנכתבו ביד.`,
  },
  SUBTOTAL_ROW: {
    heading: (n) => `${n.toLocaleString("he-IL")} רשומות שהן שורות סיכום, לא מוצרים`,
    body:
      "המחירון נושא סכומי ביניים בין השורות, והן נקלטו כמוצרים: אחת שהכותרת שלה היא \"סה״כ\", אחת שהמק״ט שלה " +
      "הוא \"סה״כ\", אחת ששמה הוא שם הלשונית, ושמות מותגים שמחזיקים מאות \"יחידות\" במחיר 0. הייבוא חוסם אותן " +
      "מעכשיו; אלה נקלטו לפני. אף אחת לא מפורסמת ולאף אחת אין תמונה.",
    what: (r) => `המחיקה תסיר ${r.products} רשומות ואת היחידות המדומות שהן מחזיקות.`,
  },
};

export function PurgeNonPriceListPanel({
  initial,
  target = "NO_PRICE_LIST",
}: {
  initial: PurgeResult;
  target?: PurgeTarget;
}) {
  const copy = COPY[target];
  const [stage, setStage] = useState<"idle" | "confirming" | "done">("idle");
  const [result, setResult] = useState<PurgeResult | null>(null);
  const [pending, start] = useTransition();

  if (initial.products === 0 && stage !== "done") return null;

  if (stage === "done" && result) {
    return (
      <div className="border-success/40 bg-success/5 mb-5 rounded-xl border p-4">
        <p className="flex items-center gap-2 text-sm font-bold">
          <Check className="text-success size-4" />
          {result.deletedProducts?.toLocaleString("he-IL")} רשומות נמחקו
          {result.deletedSources ? ` ו-${result.deletedSources} מקורות נוקו` : ""}.
        </p>
      </div>
    );
  }

  return (
    <div className="border-destructive/30 bg-destructive/5 mb-5 rounded-xl border p-4">
      <p className="flex items-center gap-2 text-sm font-bold">
        <AlertTriangle className="text-destructive size-4 shrink-0" />
        {copy.heading(initial.products)}
      </p>
      <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{copy.body}</p>

      {initial.orderLines > 0 ? (
        <p className="text-destructive mt-3 text-sm font-semibold">
          {initial.orderLines} שורות הזמנה מצביעות עליהם — מחיקה תשבור היסטוריית הזמנות, ולכן הכפתור חסום.
        </p>
      ) : stage === "idle" ? (
        <>
          <p className="text-muted-foreground mt-3 text-sm">
            {copy.what(initial)} אף אחד מהם לא נמכר אי פעם.{" "}
            <strong className="text-foreground">הפעולה אינה הפיכה.</strong>
          </p>
          <button
            type="button"
            onClick={() => setStage("confirming")}
            className="border-destructive text-destructive hover:bg-destructive/10 mt-3 inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm font-bold"
          >
            <Trash2 className="size-4" /> המשך למחיקה
          </button>
        </>
      ) : (
        <div className="border-destructive/40 bg-background mt-3 rounded-xl border p-3">
          <p className="text-sm font-bold">למחוק {initial.products.toLocaleString("he-IL")} רשומות?</p>
          <p className="text-muted-foreground mt-1 text-sm">
            אין דרך לשחזר.
            {target === "NO_PRICE_LIST" &&
              " אם ספק יחזיר אחד מהמוצרים למחירון, הוא ייווצר מחדש כשורה גולמית בלי תמונה."}
          </p>
          {result?.error && <p className="text-destructive mt-2 text-sm font-semibold">{result.error}</p>}
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await purgeNonPriceListProductsAction(target);
                  setResult(r);
                  if (r.success && r.deletedProducts !== undefined) setStage("done");
                })
              }
              className="bg-destructive text-destructive-foreground inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
            >
              <Trash2 className="size-4" />
              {pending ? "מוחק…" : "כן, למחוק"}
            </button>
            <button
              type="button"
              onClick={() => setStage("idle")}
              className="border-border inline-flex items-center gap-1.5 rounded-lg border px-4 py-2 text-sm"
            >
              <X className="size-4" /> ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
