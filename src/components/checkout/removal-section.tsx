"use client";

import Link from "next/link";
import { Recycle, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BUSINESS } from "@/lib/business";
import {
  REMOVAL_ACKNOWLEDGEMENT,
  REMOVAL_FREE_NOTE,
  REMOVAL_NOT_A_TRADESMAN,
  REMOVAL_ORDERING_ENABLED,
  REMOVAL_PAGE_PATH,
  REMOVAL_PREPARATION,
  asksExceptionalQuestions,
  removalRequestLabel,
  removalTimingNote,
  type RemovalGroup,
} from "@/lib/recycling";
import { EXCEPTIONAL_REMOVAL_REASONS } from "@/lib/enums";
import type { DeliveryMethod } from "@/lib/delivery";

/**
 * "קנית מוצר חדש? ניקח את הישן" — at the checkout, where the decision is.
 *
 * The law gives the buyer this right and most people do not know they have
 * it, which is why the brief insists it appears during the purchase and not
 * only in the terms and the footer. It is also why this is one tick per
 * appliance and nothing more: everything complicated about it — who collects,
 * from where, whether it can be charged for — is the shop's problem, and the
 * customer's part is a box.
 *
 * A CHECKBOX PER LINE, NAMED AFTER THE APPLIANCE. Never a general "פינוי מוצר
 * ישן": somebody reading that has to work out what they are agreeing to hand
 * over, and the answer is not free choice — the law is same-for-same, so what
 * they may give is decided by what they bought. An order with a fridge and a
 * television therefore gets two boxes, each naming its own old appliance.
 *
 * WHAT CHANGES WITH THE DELIVERY METHOD, and all three are different
 * promises:
 *
 *   to the door — the driver bringing the new one takes the old one, same
 *   visit, nothing to arrange;
 *
 *   to a collection point — the courier dropping a parcel at a shop counter
 *   is not collecting a fridge from a flat, so this says so plainly and the
 *   order goes to coordination rather than pretending;
 *
 *   collected from Hadera — the customer brings it with them, which also
 *   means the access questions below are about a journey the shop is not
 *   making and are not asked.
 */
export function RemovalSection({
  items,
  deliveryMethod,
  wanted,
  onToggle,
  reasons,
  onReasonsChange,
  notes,
  onNotesChange,
  acknowledged,
  onAcknowledgedChange,
  ackError,
}: {
  items: { productId: string; title: string; removal: RemovalGroup }[];
  deliveryMethod: DeliveryMethod;
  wanted: Record<string, boolean>;
  onToggle: (productId: string, next: boolean) => void;
  reasons: string[];
  onReasonsChange: (next: string[]) => void;
  notes: string;
  onNotesChange: (next: string) => void;
  acknowledged: boolean;
  onAcknowledgedChange: (next: boolean) => void;
  /** True once the customer has tried to pay with a removal ticked and the
      confirmation not. Shown rather than silently blocking, because a button
      that does nothing is indistinguishable from a broken one. */
  ackError: boolean;
}) {
  if (items.length === 0) return null;

  const requested = items.filter((i) => wanted[i.productId]);
  const anyRequested = requested.length > 0;
  /* The access questions are about the property, not the appliance, so they
     are asked once — but only when something that could actually produce an
     exceptional removal is being collected from a home. */
  const asksAccess = requested.some((i) => asksExceptionalQuestions(i.removal, deliveryMethod));

  return (
    <section className="border-border rounded-xl border p-5">
      <h2 className="mb-1 flex items-center gap-2 font-semibold">
        <Recycle className="text-brand size-4" /> פינוי מוצר חשמלי ישן
      </h2>
      <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
        ברכישת מוצר חשמלי או אלקטרוני ניתן למסור מוצר ישן דומה, ללא תשלום, בהתאם לחוק.{" "}
        <Link href={REMOVAL_PAGE_PATH} className="text-brand underline-offset-2 hover:underline">
          לתנאי הפינוי
        </Link>
      </p>

      {REMOVAL_ORDERING_ENABLED ? (
        <>
          <div className="flex flex-col gap-3">
            {items.map((item) => (
              <Label
                key={item.productId}
                className="border-input has-[[data-state=checked]]:border-brand has-[[data-state=checked]]:bg-brand/5 flex cursor-pointer items-start gap-3 rounded-lg border p-3"
              >
                <Checkbox
                  className="mt-0.5"
                  checked={!!wanted[item.productId]}
                  onCheckedChange={(v) => onToggle(item.productId, v === true)}
                />
                <span className="text-sm leading-relaxed font-normal">
                  <span className="block font-medium">
                    {removalRequestLabel(item.removal, deliveryMethod)}
                  </span>
                  {/* Which line of the order this belongs to. With one
                      eligible product it is redundant; with a fridge and a
                      television it is the difference between two boxes that
                      can be told apart and two that cannot. */}
                  <span className="text-muted-foreground block text-xs">{item.title}</span>
                </span>
              </Label>
            ))}
          </div>

          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">{REMOVAL_FREE_NOTE}</p>

          {anyRequested && (
            <div className="border-border mt-4 flex flex-col gap-4 border-t pt-4">
              <p className="text-muted-foreground text-sm leading-relaxed">
                {removalTimingNote(deliveryMethod)}
              </p>

              {asksAccess && (
                <div>
                  <p className="mb-2 text-sm font-medium">האם אחד מהמצבים הבאים מתקיים?</p>
                  <div className="flex flex-col gap-2">
                    {EXCEPTIONAL_REMOVAL_REASONS.map((r) => (
                      <Label key={r.key} className="flex cursor-pointer items-start gap-2.5 text-sm font-normal">
                        <Checkbox
                          className="mt-0.5"
                          checked={reasons.includes(r.key)}
                          onCheckedChange={(v) =>
                            onReasonsChange(
                              v === true ? [...reasons, r.key] : reasons.filter((k) => k !== r.key),
                            )
                          }
                        />
                        <span className="leading-relaxed">{r.label}</span>
                      </Label>
                    ))}
                  </div>
                  <p className="text-muted-foreground mt-2 text-xs leading-relaxed">
                    עד שתי קומות ללא מעלית נחשבות לפינוי רגיל ללא תוספת בשל המדרגות. אם הדירה בקומה 6 והמעלית
                    מגיעה לקומה 4 — נותרות שתי קומות, וזה אינו נחשב כשלעצמו ל-3 קומות ומעלה.
                  </p>
                  {reasons.length > 0 && (
                    /* Said the moment a box is ticked and not at the end, so
                       nobody completes a purchase believing a removal is
                       free and finds out on the doorstep. The law requires
                       the price to be known before the work, which means
                       before this order, which means here. */
                    <p className="border-warning/30 bg-warning/10 text-foreground mt-3 flex items-start gap-2 rounded-lg border p-3 text-xs leading-relaxed">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                      <span>
                        פינוי במצב כזה עשוי להיחשב פינוי חריג ולהיות כרוך בתשלום. לא נבצע אותו לפני שניצור איתכם
                        קשר ונסכם את העלות — ההזמנה עצמה אינה מחויבת בתוספת כלשהי עכשיו.
                      </span>
                    </p>
                  )}
                </div>
              )}

              <div>
                <p className="mb-2 text-sm font-medium">איך המוצר הישן צריך להיות מוכן</p>
                <ul className="text-muted-foreground flex list-disc flex-col gap-0.5 ps-5 text-xs leading-relaxed">
                  {REMOVAL_PREPARATION.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{REMOVAL_NOT_A_TRADESMAN}</p>
              </div>

              <div>
                <Label className="mb-1.5 text-sm">הערות לפינוי (אופציונלי)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="למשל: המקרר נמצא במרפסת, הכניסה מהחניון"
                />
              </div>

              <Label
                className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm font-normal ${
                  ackError ? "border-destructive bg-destructive/5" : "border-input"
                }`}
              >
                <Checkbox
                  className="mt-0.5"
                  aria-invalid={ackError}
                  checked={acknowledged}
                  onCheckedChange={(v) => onAcknowledgedChange(v === true)}
                />
                <span className="leading-relaxed">{REMOVAL_ACKNOWLEDGEMENT}</span>
              </Label>
              {ackError && (
                <p className="text-destructive -mt-2 text-xs">
                  יש לאשר את תנאי הכנת המוצר לפינוי, או להסיר את סימון הפינוי.
                </p>
              )}
            </div>
          )}
        </>
      ) : (
        /* The switch in lib/recycling.ts is off: the shop has no carrier
           arrangement yet for collecting the old one, so there is no box to
           tick. The right is still real and is still stated — with the phone
           number that can actually act on it, rather than a checkbox whose
           answer nobody would receive. */
        <p className="text-muted-foreground border-border bg-muted/40 rounded-lg border p-3 text-sm leading-relaxed">
          לתיאום פינוי מוצר ישן יש ליצור איתנו קשר בטלפון{" "}
          <a href={BUSINESS.phoneHref} className="text-brand font-medium hover:underline">
            {BUSINESS.phone}
          </a>{" "}
          לאחר ההזמנה. הזכאות לפינוי אינה תלויה בכך.
        </p>
      )}
    </section>
  );
}
