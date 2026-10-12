"use client";

import { useState, useTransition } from "react";
import { ChevronDown, Check, CircleAlert } from "lucide-react";
import { approveAndPublishAction } from "@/actions/admin-inventory";

/**
 * The "why" and the way out, on one row of the off-site list.
 *
 * Two separate complaints produced this. "סומן לא לפרסם" said that
 * something had been decided and not what — the flag names the kind of
 * objection and the detail is in the product's open alerts, which lived on
 * a different page. And having read the reason there was no way to act on
 * it without opening the product form and finding a checkbox.
 *
 * So: the reason expands in place, and the button overrules it. The button
 * only appears where the flag really is the last thing — the server checks
 * that again before writing, because a page is a snapshot and "published"
 * on a product with no photograph is a lie that reads as done.
 */
export function OffSiteRowActions({
  productId,
  why,
  canPublish,
}: {
  productId: string;
  why: string[];
  canPublish: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <span className="text-success-foreground flex items-center gap-1 text-xs font-semibold">
        <Check className="size-3.5" /> פורסם
      </span>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        {why.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="border-border hover:bg-muted flex items-center gap-0.5 rounded border px-1.5 py-0.5 text-xs font-semibold"
            aria-expanded={open}
          >
            למה?
            <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
        {canPublish && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                const res = await approveAndPublishAction(productId);
                if (res.success) setDone(true);
                else setError(res.error ?? "לא הצלחנו לפרסם");
              })
            }
            className="bg-brand text-brand-foreground rounded px-2 py-0.5 text-xs font-semibold disabled:opacity-50"
          >
            {pending ? "מפרסם…" : "אשר ופרסם"}
          </button>
        )}
      </div>
      {open && why.length > 0 && (
        <ul className="text-muted-foreground max-w-md list-inside list-disc space-y-0.5 text-xs">
          {why.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-destructive flex items-start gap-1 text-xs font-semibold">
          <CircleAlert className="mt-0.5 size-3 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}
