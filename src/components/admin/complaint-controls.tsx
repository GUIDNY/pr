"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Paperclip, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  setComplaintStatusAction,
  setComplaintSeverityAction,
  setComplaintCategoryAction,
  assignComplaintAction,
  addComplaintNoteAction,
  linkComplaintToOrderAction,
  complaintMediaUrlAction,
} from "@/actions/admin-complaints";
import {
  COMPLAINT_STATUSES,
  COMPLAINT_STATUS_LABELS,
  COMPLAINT_SEVERITIES,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_CATEGORIES,
  COMPLAINT_CATEGORY_LABELS,
} from "@/lib/enums";

const SELECT_CLASS =
  "border-border bg-background focus:ring-brand/30 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

/** Picking is the save, the same as the orders screen — no confirm button. */
function Picker({
  label,
  value,
  options,
  onPick,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onPick: (next: string) => Promise<{ success: boolean; error: string | null }>;
}) {
  const [isPending, startTransition] = useTransition();
  const [current, setCurrent] = useState(value);

  return (
    <label className="block">
      <span className="text-muted-foreground mb-1 flex items-center gap-1.5 text-xs font-medium">
        {label}
        {isPending && <Loader2 className="size-3 animate-spin" />}
      </span>
      <select
        className={SELECT_CLASS}
        value={current}
        disabled={isPending}
        onChange={(e) => {
          const next = e.target.value;
          const previous = current;
          setCurrent(next);
          startTransition(async () => {
            const result = await onPick(next);
            if (result.success) toast.success("עודכן");
            else {
              setCurrent(previous);
              toast.error(result.error ?? "שגיאה בעדכון");
            }
          });
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ComplaintControls({
  id,
  status,
  severity,
  category,
  assignedToId,
  staff,
  orderNumber,
}: {
  id: string;
  status: string;
  severity: string;
  category: string;
  assignedToId: string | null;
  staff: { id: string; name: string }[];
  orderNumber: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <Picker
        label="סטטוס"
        value={status}
        options={COMPLAINT_STATUSES.map((s) => ({ value: s, label: COMPLAINT_STATUS_LABELS[s] }))}
        onPick={(next) => setComplaintStatusAction(id, next)}
      />
      <Picker
        label="חומרה"
        value={severity}
        options={COMPLAINT_SEVERITIES.map((s) => ({ value: s, label: COMPLAINT_SEVERITY_LABELS[s] }))}
        onPick={(next) => setComplaintSeverityAction(id, next)}
      />
      <Picker
        label="קטגוריה"
        value={category}
        options={COMPLAINT_CATEGORIES.map((c) => ({ value: c, label: COMPLAINT_CATEGORY_LABELS[c] }))}
        onPick={(next) => setComplaintCategoryAction(id, next)}
      />
      <Picker
        label="מטפל"
        value={assignedToId ?? ""}
        options={[{ value: "", label: "לא משויך" }, ...staff.map((s) => ({ value: s.id, label: s.name }))]}
        onPick={(next) => assignComplaintAction(id, next || null)}
      />
      <OrderLink id={id} orderNumber={orderNumber} />
    </div>
  );
}

function OrderLink({ id, orderNumber }: { id: string; orderNumber: string | null }) {
  const [value, setValue] = useState(orderNumber ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="block"
      action={() =>
        startTransition(async () => {
          const result = await linkComplaintToOrderAction(id, value);
          if (result.success) toast.success(value.trim() ? "נקשר להזמנה" : "הקישור הוסר");
          else toast.error(result.error ?? "שגיאה");
        })
      }
    >
      <span className="text-muted-foreground mb-1 block text-xs font-medium">מספר הזמנה</span>
      <div className="flex gap-2">
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="לדוגמה 100234" disabled={isPending} />
        <Button type="submit" variant="secondary" size="sm" disabled={isPending}>
          {isPending ? <Loader2 className="size-4 animate-spin" /> : "קישור"}
        </Button>
      </div>
    </form>
  );
}

export function ComplaintNoteBox({ id }: { id: string }) {
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="border-border bg-card rounded-xl border p-3"
      action={() =>
        startTransition(async () => {
          const result = await addComplaintNoteAction(id, body);
          if (result.success) {
            setBody("");
            toast.success("ההערה נשמרה בשרשור הפנימי");
          } else toast.error(result.error ?? "שגיאה");
        })
      }
    >
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="הערה פנימית — מה נעשה, למי פנינו, מה סוכם"
        disabled={isPending}
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        {/* Said out loud next to the button, because this is the exact spot
            where someone would assume they are writing to the customer. */}
        <span className="text-muted-foreground text-xs">ההערה נשמרת כאן בלבד ואינה נשלחת ללקוח.</span>
        <Button type="submit" size="sm" disabled={isPending || !body.trim()} className="gap-1.5">
          {isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
          שמירה
        </Button>
      </div>
    </form>
  );
}

/**
 * The link is minted on click rather than rendered into the page, so the
 * ten-minute signed URL starts counting when someone actually wants to look
 * at the file — and a page left open overnight holds no live link.
 */
export function ComplaintMediaButton({ messageId, mime }: { messageId: string; mime: string | null }) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      disabled={isPending}
      className="mt-2 gap-1.5"
      onClick={() =>
        startTransition(async () => {
          const { url } = await complaintMediaUrlAction(messageId);
          if (url) window.open(url, "_blank", "noopener,noreferrer");
          else toast.error("הקובץ לא נשמר אצלנו");
        })
      }
    >
      {isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-3.5" />}
      פתיחת הקובץ ({mime ?? "לא ידוע"})
    </Button>
  );
}
