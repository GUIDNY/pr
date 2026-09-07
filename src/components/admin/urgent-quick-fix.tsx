"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Banknote, Boxes, Tag, Hash } from "lucide-react";
import { toast } from "sonner";
import {
  applyUrgentFixAction,
  resolveUrgentAlertAction,
  type QuickFixField,
} from "@/actions/admin-urgent-review";

/**
 * The one-line repair, on the card that describes the problem.
 *
 * Most urgent findings end in a single number — which of two prices is real,
 * what the shelf actually holds — and the queue used to answer that by
 * sending you to the full product form. Sixty findings became sixty trips.
 */
export function UrgentQuickFix({
  alertId,
  field,
  currentValue,
  brands,
}: {
  alertId: string;
  field: QuickFixField | null;
  currentValue: string;
  brands?: { id: string; name: string }[];
}) {
  const [value, setValue] = useState(currentValue);
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <p className="text-success mt-3 flex items-center gap-1.5 text-xs font-medium">
        <Check className="size-3.5" />
        טופל. ירד מהרשימה ברענון הבא.
      </p>
    );
  }

  const run = (task: () => Promise<{ success: boolean; error: string | null }>) =>
    startTransition(async () => {
      const result = await task();
      if (result.success) {
        setDone(true);
        toast.success("נשמר");
      } else {
        toast.error(result.error ?? "לא הצלחנו לשמור");
      }
    });

  const FIELD_LABEL: Record<QuickFixField, { text: string; icon: typeof Banknote }> = {
    price: { text: "מחיר חדש", icon: Banknote },
    stockQty: { text: "מלאי אמיתי", icon: Boxes },
    brandId: { text: "המותג הנכון", icon: Tag },
    model: { text: "קוד הדגם הנכון", icon: Hash },
  };
  const Icon = field ? FIELD_LABEL[field].icon : Banknote;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {field && (
        <>
          <label className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Icon className="size-3.5" />
            {FIELD_LABEL[field].text}
          </label>
          {field === "brandId" ? (
            <select
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              className="border-border bg-background focus:border-brand h-8 max-w-56 rounded-lg border px-2 text-sm outline-none"
            >
              {(brands ?? []).map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          ) : field === "model" ? (
            <input
              type="text"
              dir="ltr"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              placeholder="HBG578ES3"
              className="border-border bg-background focus:border-brand h-8 w-44 rounded-lg border px-2 text-sm outline-none"
            />
          ) : (
            <input
              type="number"
              inputMode="decimal"
              min={0}
              step={field === "price" ? "0.01" : "1"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={pending}
              className="border-border bg-background focus:border-brand h-8 w-28 rounded-lg border px-2 text-sm outline-none"
            />
          )}
          <button
            type="button"
            disabled={pending || value.trim() === "" || value === currentValue}
            onClick={() => run(() => applyUrgentFixAction(alertId, field, value))}
            className="bg-brand text-brand-foreground flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            שמור וסמן כטופל
          </button>
        </>
      )}

      <button
        type="button"
        disabled={pending}
        onClick={() => run(() => resolveUrgentAlertAction(alertId))}
        className="border-border hover:border-brand/40 hover:text-brand h-8 rounded-lg border px-3 text-xs font-medium transition-colors disabled:opacity-40"
      >
        {field ? "תקין כמו שהוא — סמן כטופל" : "סמן כטופל"}
      </button>

      {field === "stockQty" && (
        <p className="text-muted-foreground w-full text-[11px]">
          שימו לב: הסנכרון הבא קורא את המלאי מחדש מהגיליון ויחזיר את מה שכתוב שם. התיקון כאן מסדיר את האתר עכשיו — כדי
          שזה יחזיק, המספר צריך להשתנות גם אצל הספק.
        </p>
      )}
    </div>
  );
}
