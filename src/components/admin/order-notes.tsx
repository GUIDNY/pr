"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { addOrderNoteAction } from "@/actions/admin-orders";
import { formatDateTime } from "@/lib/format";

type Note = { id: string; body: string; isInternal: boolean; createdAt: string; authorName: string | null };

export function OrderNotes({ orderId, initialNotes }: { orderId: string; initialNotes: Note[] }) {
  const [notes, setNotes] = useState(initialNotes);
  const [body, setBody] = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [isPending, startTransition] = useTransition();

  function submit() {
    if (!body.trim()) return;
    startTransition(async () => {
      const result = await addOrderNoteAction(orderId, body, isInternal);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בהוספת הערה");
        return;
      }
      setNotes((n) => [{ id: Math.random().toString(), body, isInternal, createdAt: new Date().toISOString(), authorName: "אני" }, ...n]);
      setBody("");
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Textarea placeholder="הוסיפו הערה..." value={body} onChange={(e) => setBody(e.target.value)} rows={2} />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Checkbox id="internal" checked={isInternal} onCheckedChange={(v) => setIsInternal(Boolean(v))} />
            <Label htmlFor="internal" className="text-sm font-normal">הערה פנימית (לא גלויה ללקוח)</Label>
          </div>
          <Button size="sm" variant="brand" onClick={submit} disabled={isPending || !body.trim()}>
            הוספה
          </Button>
        </div>
      </div>

      <ul className="flex flex-col gap-3">
        {notes.length === 0 && <li className="text-muted-foreground text-sm">אין הערות עדיין</li>}
        {notes.map((note) => (
          <li key={note.id} className="border-border rounded-lg border p-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{note.authorName ?? "מערכת"}</span>
              <span className="text-muted-foreground text-xs">{formatDateTime(note.createdAt)}</span>
            </div>
            <p>{note.body}</p>
            {note.isInternal && <span className="text-muted-foreground mt-1 inline-block text-xs">פנימי</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
