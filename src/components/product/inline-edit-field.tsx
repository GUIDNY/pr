"use client";

import { useState, useTransition } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

type SaveResult = { success: boolean; error?: string | null };

// Admin-only click-to-edit for a single field, saved through whatever
// server action the caller passes in — the field itself doesn't know or
// care which product field it's editing. The collapsed view renders plain
// text only (it's a <button>, which can't legally contain a heading or
// other non-phrasing content) — a caller that needs a styled/semantic
// display (an <h1>, a formatted price, ...) should use startInEditMode with
// its own trigger instead, the way ProductTitleEditor/ProductPriceEditor do.
export function InlineEditField({
  value,
  onSave,
  type = "text",
  className,
  inputClassName,
  placeholder = "לא הוגדר",
  startInEditMode = false,
  onCancel,
}: {
  value: string;
  onSave: (value: string) => Promise<SaveResult>;
  type?: "text" | "number" | "textarea";
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  // Skips the collapsed clickable view entirely — for callers that already
  // have their own trigger (e.g. a pencil icon next to a differently-styled
  // display) and just need the input+save/cancel part.
  startInEditMode?: boolean;
  onCancel?: () => void;
}) {
  const [editing, setEditing] = useState(startInEditMode);
  // The server prop only reflects reality until the next full page load —
  // track the latest successful save locally so the collapsed view shows
  // what was actually just saved, not a stale value frozen from render time.
  const [savedValue, setSavedValue] = useState(value);
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await onSave(draft);
      if (result.success) {
        setSavedValue(draft);
        setEditing(false);
      } else {
        setError(result.error ?? "שגיאה בשמירה");
      }
    });
  }

  function cancel() {
    setDraft(savedValue);
    setError(null);
    setEditing(false);
    onCancel?.();
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => {
          setDraft(savedValue);
          setEditing(true);
        }}
        className={cn("group/inline inline-flex items-start gap-1.5 rounded text-start", className)}
      >
        <span>{savedValue || <span className="text-muted-foreground italic">{placeholder}</span>}</span>
        <Pencil className="text-amber-600 mt-1 size-3.5 shrink-0 opacity-0 transition-opacity group-hover/inline:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {type === "textarea" ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          autoFocus
          className={cn(
            "border-amber-500 focus:ring-amber-500/30 w-full rounded-lg border p-2 text-sm outline-none focus:ring-2",
            inputClassName
          )}
        />
      ) : (
        <input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") cancel();
          }}
          className={cn(
            "border-amber-500 focus:ring-amber-500/30 w-full rounded-lg border px-2 py-1 outline-none focus:ring-2",
            inputClassName
          )}
        />
      )}
      {error && <p className="text-destructive text-xs">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="bg-amber-500 flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-50"
        >
          <Check className="size-3.5" /> שמור
        </button>
        <button
          type="button"
          onClick={cancel}
          className="text-muted-foreground hover:bg-muted flex items-center gap-1 rounded-full px-3 py-1 text-xs"
        >
          <X className="size-3.5" /> ביטול
        </button>
      </div>
    </div>
  );
}
