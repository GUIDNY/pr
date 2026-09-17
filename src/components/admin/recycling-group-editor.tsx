"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { saveRecyclingGroupAction } from "@/actions/admin-recycling";

export type GroupRow = {
  id: string;
  key: string;
  label: string;
  oldLabel: string;
  isLargeAppliance: boolean;
  asksExceptional: boolean;
  exceptionalFee: number | null;
  isEnabled: boolean;
  sortOrder: number;
  categoryCount: number;
  productCount: number;
};

const BLANK: GroupRow = {
  id: "",
  key: "",
  label: "",
  oldLabel: "",
  isLargeAppliance: false,
  asksExceptional: false,
  exceptionalFee: null,
  isEnabled: true,
  sortOrder: 900,
  categoryCount: 0,
  productCount: 0,
};

/**
 * The equipment groups, editable.
 *
 * A dialog rather than inline fields, because a group is seven decisions that
 * belong together — the wording, whether it is large, whether the access
 * questions are asked, what an exceptional one costs — and a row that saves
 * each one as you leave the box would publish half a change.
 *
 * `key` is locked once the group exists. It is snapshotted onto every order
 * line that has ever used the group and it is what the carrier is told;
 * editing it would rename the past.
 */
export function RecyclingGroupEditor({ groups }: { groups: GroupRow[] }) {
  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [isPending, startTransition] = useTransition();
  const [draft, setDraft] = useState<GroupRow>(BLANK);

  function open(group: GroupRow) {
    setDraft(group);
    setEditing(group);
  }

  function save() {
    startTransition(async () => {
      const result = await saveRecyclingGroupAction({
        id: draft.id || undefined,
        key: draft.key,
        label: draft.label,
        oldLabel: draft.oldLabel,
        isLargeAppliance: draft.isLargeAppliance,
        asksExceptional: draft.asksExceptional,
        exceptionalFee: draft.exceptionalFee,
        isEnabled: draft.isEnabled,
        sortOrder: draft.sortOrder,
      });
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בשמירה");
        return;
      }
      toast.success("נשמר");
      setEditing(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => open(BLANK)}>
          <Plus className="size-4" /> קבוצת פינוי חדשה
        </Button>
      </div>

      <div className="border-border overflow-x-auto rounded-xl border">
        <table className="w-full text-start text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-start font-semibold">קבוצה</th>
              <th className="px-3 py-2 text-start font-semibold">מה הלקוח מוסר</th>
              <th className="px-3 py-2 text-start font-semibold">מוצר גדול</th>
              <th className="px-3 py-2 text-start font-semibold">שאלות פינוי חריג</th>
              <th className="px-3 py-2 text-start font-semibold">מחיר חריג</th>
              <th className="px-3 py-2 text-start font-semibold">קטגוריות</th>
              <th className="px-3 py-2 text-start font-semibold"></th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id} className={`border-border border-t ${g.isEnabled ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">
                  <span className="font-medium">{g.label}</span>
                  <span className="text-muted-foreground block text-xs" dir="ltr">
                    {g.key}
                  </span>
                </td>
                <td className="px-3 py-2">{g.oldLabel}</td>
                <td className="px-3 py-2">{g.isLargeAppliance ? "כן" : "לא"}</td>
                <td className="px-3 py-2">{g.asksExceptional ? "כן" : "לא"}</td>
                <td className="px-3 py-2">
                  {g.exceptionalFee === null ? (
                    <span className="text-muted-foreground">לפי תיאום</span>
                  ) : (
                    `${g.exceptionalFee} ₪`
                  )}
                </td>
                <td className="text-muted-foreground px-3 py-2 tabular-nums">
                  {g.categoryCount}
                  {g.productCount > 0 && ` · ${g.productCount} מוצרים ידנית`}
                </td>
                <td className="px-3 py-2">
                  <Button size="sm" variant="ghost" onClick={() => open(g)}>
                    <Pencil className="size-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{draft.id ? `עריכת ${draft.label}` : "קבוצת פינוי חדשה"}</DialogTitle>
            <DialogDescription>
              הקבוצה קובעת מה הלקוח רשאי למסור וכיצד זה מנוסח בקופה, באישור ההזמנה ובהעברה למוביל.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div>
              <Label className="mb-1.5">מזהה באנגלית</Label>
              <Input
                dir="ltr"
                value={draft.key}
                disabled={Boolean(draft.id)}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                placeholder="washing_machine"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                {draft.id
                  ? "לא ניתן לשינוי — המזהה נשמר על הזמנות קיימות ומועבר למוביל."
                  : "אותיות קטנות וקו תחתון. זה מה שמועבר למוביל."}
              </p>
            </div>
            <div>
              <Label className="mb-1.5">שם המוצר</Label>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="מכונת כביסה"
              />
            </div>
            <div>
              <Label className="mb-1.5">שם המוצר הישן, כפי שיוצג ללקוח</Label>
              <Input
                value={draft.oldLabel}
                onChange={(e) => setDraft({ ...draft, oldLabel: e.target.value })}
                placeholder="מכונת כביסה ישנה"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                המשפט המלא, כולל התאמת מין ומספר: &quot;מכונת כביסה ישנה&quot;, &quot;כיריים ישנות&quot;.
                בקופה יוצג &quot;אני מעוניין בפינוי {draft.oldLabel || "…"} בעת אספקת המוצר החדש&quot;.
              </p>
            </div>

            <Label className="flex cursor-pointer items-start gap-2.5 text-sm font-normal">
              <Checkbox
                className="mt-0.5"
                checked={draft.isLargeAppliance}
                onCheckedChange={(v) => setDraft({ ...draft, isLargeAppliance: v === true })}
              />
              <span>
                מוצר חשמלי גדול
                <span className="text-muted-foreground block text-xs">
                  לפחות צלע אחת ארוכה מ-50 ס&quot;מ. רק במוצר גדול ניתן לגבות על פינוי חריג.
                </span>
              </span>
            </Label>

            <Label className="flex cursor-pointer items-start gap-2.5 text-sm font-normal">
              <Checkbox
                className="mt-0.5"
                checked={draft.asksExceptional}
                onCheckedChange={(v) => setDraft({ ...draft, asksExceptional: v === true })}
              />
              <span>
                לשאול את שאלות הפינוי החריג
                <span className="text-muted-foreground block text-xs">
                  מדרגות, מנוף, פירוק וגישה. לא נשאלות באיסוף עצמי.
                </span>
              </span>
            </Label>

            <div>
              <Label className="mb-1.5">מחיר פינוי חריג (₪)</Label>
              <Input
                type="number"
                min={0}
                max={5000}
                value={draft.exceptionalFee ?? ""}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    exceptionalFee: e.target.value.trim() === "" ? null : Number(e.target.value),
                  })
                }
                placeholder="ריק = לפי תיאום"
              />
              <p className="text-muted-foreground mt-1 text-xs">
                ריק פירושו שהלקוח מקבל טלפון ולא מספר. אפס פירושו חינם גם בפינוי חריג.
              </p>
            </div>

            <Label className="flex cursor-pointer items-start gap-2.5 text-sm font-normal">
              <Checkbox
                className="mt-0.5"
                checked={draft.isEnabled}
                onCheckedChange={(v) => setDraft({ ...draft, isEnabled: v === true })}
              />
              <span>
                פעילה
                <span className="text-muted-foreground block text-xs">
                  כיבוי מסיר את אפשרות הפינוי מכל הקטגוריות שמשויכות לקבוצה, בלי לבטל את השיוך.
                </span>
              </span>
            </Label>

            <div>
              <Label className="mb-1.5">סדר תצוגה</Label>
              <Input
                type="number"
                value={draft.sortOrder}
                onChange={(e) => setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={isPending}>
              ביטול
            </Button>
            <Button variant="brand" onClick={save} disabled={isPending}>
              {isPending ? "שומר..." : "שמירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
