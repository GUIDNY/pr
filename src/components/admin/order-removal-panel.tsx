"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Recycle, AlertTriangle, Copy, Check, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  updateRemovalStatusAction,
  setRemovalFeeAction,
  markRemovalHandedOffAction,
} from "@/actions/admin-removals";
import {
  REMOVAL_STATUSES,
  REMOVAL_STATUS_COLORS,
  REMOVAL_STATUS_LABELS,
  type RemovalStatus,
} from "@/lib/enums";
import { formatDateTime } from "@/lib/format";
import type { RemovalLine } from "@/lib/recycling";

/**
 * The removal, on the order screen, where the brief asks for it to be
 * impossible to miss.
 *
 * TOP OF THE PAGE AND ITS OWN BOX. A removal is not a property of the order
 * like the coupon code — it is a second job attached to the same visit, done
 * by a different person, and the way it fails is that nobody notices it is
 * there. So it is the first thing above the items, in the shop's orange, and
 * it says "פינוי מוצר ישן: כן" in those words.
 *
 * THE RED BAR IS THE FEATURE. There is no API into צ'יטה: a removal reaches
 * them inside the booking a person makes by hand. Software cannot make that
 * happen, but it can refuse to let it be forgotten — so an order with a
 * requested removal that has not been marked handed off shows a warning here
 * and a flag in the orders list, and the text to paste into the booking is
 * one button away rather than something to reassemble from the fields below.
 */
export function OrderRemovalPanel({
  orderId,
  lines,
  handoffText,
}: {
  orderId: string;
  lines: RemovalLine[];
  handoffText: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  const handedOffAt = lines.find((l) => l.handedOffAt)?.handedOffAt ?? null;
  const needsCoordination = lines.some((l) => l.status === "NEEDS_COORDINATION");

  async function copyHandoff() {
    try {
      await navigator.clipboard.writeText(handoffText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* A browser that refuses the clipboard — an insecure origin, a
         permission denied — must not leave the person with nothing. The text
         is on the screen below either way, so this only tells them to use it. */
      toast.error("לא ניתן להעתיק אוטומטית. אפשר לסמן ולהעתיק את הטקסט למטה.");
    }
  }

  function setStatus(lineId: string, status: string) {
    startTransition(async () => {
      const result = await updateRemovalStatusAction(lineId, status);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בעדכון");
        return;
      }
      toast.success("סטטוס הפינוי עודכן");
    });
  }

  function saveFee(lineId: string, raw: string) {
    const trimmed = raw.trim();
    const fee = trimmed === "" ? null : Number(trimmed);
    startTransition(async () => {
      const result = await setRemovalFeeAction(lineId, fee);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בשמירת הסכום");
        return;
      }
      toast.success(fee === null ? "עלות הפינוי נמחקה" : "עלות הפינוי נשמרה");
    });
  }

  function markHandedOff() {
    startTransition(async () => {
      const result = await markRemovalHandedOffAction(orderId);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בסימון");
        return;
      }
      toast.success("נרשם שהפינוי הועבר למוביל");
    });
  }

  return (
    <div className="border-brand/40 bg-brand/5 rounded-xl border-2 p-5">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-bold">
        <Recycle className="text-brand size-5" /> פינוי מוצר ישן: כן
      </h2>
      <p className="text-muted-foreground mb-4 text-sm">
        {lines.length === 1 ? "מוצר אחד לפינוי" : `${lines.length} מוצרים לפינוי`}
        {needsCoordination && " · דורש תיאום טלפוני עם הלקוח לפני הזמנת המוביל"}
      </p>

      {/* The gap, named. Not a nag: it disappears the moment somebody says the
          carrier was told, and it is the only record that they were. */}
      {handedOffAt ? (
        <p className="text-success mb-4 flex items-center gap-2 text-sm font-medium">
          <Check className="size-4" /> הועבר למוביל ב-{formatDateTime(new Date(handedOffAt))}
        </p>
      ) : (
        <div className="border-destructive/40 bg-destructive/5 mb-4 rounded-lg border p-3">
          <p className="text-destructive flex items-start gap-2 text-sm font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              המידע על הפינוי עדיין לא הועבר למוביל. הלקוח סימן פינוי באתר — אם המוביל לא יקבל את המידע, המוצר הישן
              יישאר אצלו.
            </span>
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={copyHandoff} disabled={isPending}>
              {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
              {copied ? "הועתק" : "העתקת טקסט למוביל"}
            </Button>
            <Button size="sm" variant="brand" onClick={markHandedOff} disabled={isPending}>
              <Truck className="size-4" /> סימון שהועבר למוביל
            </Button>
          </div>
        </div>
      )}

      <ul className="divide-border/60 divide-y">
        {lines.map((line) => (
          <li key={line.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {line.label}
                  <span className="text-muted-foreground font-normal"> · {line.key}</span>
                </p>
                <p className="text-muted-foreground text-xs">נרכש: {line.productTitle}</p>
              </div>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${REMOVAL_STATUS_COLORS[line.status as RemovalStatus]}`}
              >
                {REMOVAL_STATUS_LABELS[line.status as RemovalStatus]}
              </span>
            </div>

            <p className="text-sm">
              {line.exceptional ? (
                <span className="text-warning-foreground font-medium">פינוי חריג</span>
              ) : (
                <span className="text-muted-foreground">פינוי רגיל · ללא עלות</span>
              )}
              {line.reasonLabels.length > 0 && (
                <span className="text-muted-foreground"> — {line.reasonLabels.join(" · ")}</span>
              )}
            </p>

            {line.notes && (
              <p className="border-warning/30 bg-warning/10 rounded-lg border p-2 text-xs">
                <span className="font-medium">הערת הלקוח: </span>
                {line.notes}
              </p>
            )}

            {/* Only said when it is false, which it should never be: the
                checkout refuses a request without it. A line that reaches
                here unacknowledged came from somewhere else, and that is
                worth seeing. */}
            {!line.acknowledged && (
              <p className="text-destructive text-xs font-medium">
                הלקוח לא אישר את תנאי הכנת המוצר — לברר לפני הפינוי.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <p className="text-muted-foreground mb-1 text-xs">סטטוס פינוי</p>
                <Select
                  value={line.status}
                  onValueChange={(v) => setStatus(line.id, v)}
                  disabled={isPending}
                >
                  <SelectTrigger size="sm" className="w-44 bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REMOVAL_STATUSES.filter((s) => s !== "NOT_REQUESTED").map((s) => (
                      <SelectItem key={s} value={s}>
                        {REMOVAL_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Only on an exceptional line. A price box on an ordinary
                  removal is an invitation to charge for something the law
                  says is free. */}
              {line.exceptional && (
                <div>
                  <p className="text-muted-foreground mb-1 text-xs">עלות פינוי חריג שסוכמה (₪)</p>
                  <Input
                    type="number"
                    min={0}
                    max={5000}
                    defaultValue={line.fee ?? ""}
                    placeholder="ריק = טרם סוכם"
                    disabled={isPending}
                    className="bg-background h-9 w-44"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      const current = line.fee === null ? "" : String(line.fee);
                      if (next !== current) saveFee(line.id, next);
                    }}
                  />
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* The text itself, always on screen and not only behind the button.
          A clipboard that refuses, a browser that blocks it, a person who
          would rather read it before pasting it — all of them need this. */}
      <details className="mt-4">
        <summary className="text-muted-foreground cursor-pointer text-xs">הטקסט שמועבר למוביל</summary>
        <pre className="bg-background border-border mt-2 overflow-x-auto rounded-lg border p-3 text-xs whitespace-pre-wrap">
          {handoffText}
        </pre>
      </details>
    </div>
  );
}
