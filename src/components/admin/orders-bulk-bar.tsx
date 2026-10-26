"use client";

import { useState, useTransition } from "react";
import { RotateCcw, Trash2, X } from "lucide-react";
import { purgeOrdersAction, restoreOrdersAction, trashOrdersAction } from "@/actions/seller-orders";

/**
 * What you can do to a set of selected orders, in the one bar both order
 * lists use.
 *
 * It appears only once something is selected, and it is the same component
 * in the salesperson's card list and the manager's table on purpose: the two
 * screens look nothing alike and the consequences of pressing this are
 * identical, so the wording, the two-step confirm and the money rule had
 * better not be written twice.
 */
export function OrdersBulkBar({
  selected,
  inTrash,
  blockedFromPurge = [],
  onClear,
  onDone,
}: {
  selected: string[];
  inTrash: boolean;
  /** Selected orders that may not be destroyed yet — a live hold on the
      card. They may still be restored, which is why they are selectable at
      all, so the refusal belongs on this one button and not on the row. */
  blockedFromPurge?: string[];
  onClear: () => void;
  onDone: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  /* The permanent delete needs a second press, and the button says what the
     second press will do rather than opening a dialog to ask. Any other
     click on the bar disarms it. */
  const [armed, setArmed] = useState(false);
  const [pending, startTransition] = useTransition();

  const count = selected.length;
  if (count === 0) return null;
  const purgeBlocked = blockedFromPurge.length > 0;

  function run(action: (numbers: string[]) => Promise<{ success: boolean; error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const result = await action(selected);
      setArmed(false);
      if (!result.success) {
        setError(result.error);
        return;
      }
      onDone();
    });
  }

  return (
    <div className="sticky bottom-3 z-10 mt-2 flex flex-col gap-2">
      {error && (
        <p className="bg-destructive text-destructive-foreground rounded-lg px-3 py-2 text-sm font-semibold shadow-lg">
          {error}
        </p>
      )}
      <div className="border-border bg-card flex flex-wrap items-center gap-2 rounded-xl border p-3 shadow-lg">
        <span className="text-sm font-black">נבחרו {count}</span>

        <button
          type="button"
          onClick={() => {
            setArmed(false);
            setError(null);
            onClear();
          }}
          className="text-muted-foreground hover:text-foreground flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold"
        >
          <X className="size-3.5" /> בטל בחירה
        </button>

        <div className="flex-1" />

        {inTrash ? (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={() => run(restoreOrdersAction)}
              className="hover:bg-muted flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-40"
            >
              <RotateCcw className="size-4" /> שחזר
            </button>
            <button
              type="button"
              disabled={pending || purgeBlocked}
              onClick={() => (armed ? run(purgeOrdersAction) : setArmed(true))}
              title={
                purgeBlocked
                  ? `יש תפיסה פעילה בכרטיס ב-${blockedFromPurge.length} מההזמנות שנבחרו (${blockedFromPurge
                      .slice(0, 3)
                      .join(", ")}${blockedFromPurge.length > 3 ? "…" : ""}). אפשר לשחזר אותן; למחוק לצמיתות רק אחרי שהתפיסה פוקעת.`
                  : undefined
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40"
            >
              <Trash2 className="size-4" />
              {purgeBlocked
                ? `${blockedFromPurge.length} מהן עדיין עם תפיסה בכרטיס`
                : armed
                  ? `לחץ שוב — ${count} יימחקו ולא יחזרו`
                  : `מחק ${count} לצמיתות`}
            </button>
          </>
        ) : (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(trashOrdersAction)}
            className="text-destructive hover:bg-destructive/10 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-40"
          >
            <Trash2 className="size-4" /> העבר {count} לפח
          </button>
        )}
      </div>
    </div>
  );
}
