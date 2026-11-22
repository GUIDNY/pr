"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { addOrderNoteAction } from "@/actions/admin-orders";
import { formatDateTime } from "@/lib/format";

type Note = { id: string; body: string; createdAt: string; authorName: string | null };

/** The notes the owner writes most. A tap fills the field, so "טופל על ידי"
    can be finished by hand before it is saved. */
const QUICK = ["יצאה קבלה", "לא יצאה קבלה", "טופל", "טופל על ידי "];

/**
 * Internal notes on an order. Never shown to the customer: the action stores
 * every note as internal, and the customer's own queries read only the
 * others.
 */
export function OrderNotes({ orderId, initialNotes }: { orderId: string; initialNotes: Note[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addOrderNoteAction(orderId, body);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בהוספת הערה");
        return;
      }
      setBody("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-xs">פנימי בלבד. הלקוח לא רואה את ההערות האלה.</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setBody(q)}
              className="border-border bg-muted/40 hover:bg-muted min-h-10 rounded-full border px-3 text-sm"
            >
              {q.trim()}
            </button>
          ))}
        </div>
        <Textarea placeholder="כתבו הערה פנימית…" value={body} onChange={(e) => setBody(e.target.value)} rows={2} className="text-base" />
        <Button variant="brand" onClick={submit} disabled={isPending || !body.trim()} className="h-12 w-full text-base">
          {isPending ? "שומר…" : "הוסף הערה"}
        </Button>
      </div>

      <ul className="flex flex-col gap-3">
        {initialNotes.length === 0 && <li className="text-muted-foreground text-sm">אין הערות עדיין</li>}
        {initialNotes.map((note) => (
          <li key={note.id} className="border-border rounded-lg border p-3 text-sm">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-medium">{note.authorName ?? "מערכת"}</span>
              <span className="text-muted-foreground text-xs">{formatDateTime(note.createdAt)}</span>
            </div>
            <p className="whitespace-pre-wrap">{note.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
