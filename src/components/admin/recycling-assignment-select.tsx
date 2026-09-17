"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { setCategoryRecyclingAction, setProductRecyclingAction } from "@/actions/admin-recycling";

export type GroupOption = { id: string; label: string };

/* Two sentinels, because a <select> cannot hold null and the two blanks mean
   different things. NONE on a category is "no removal for anything under
   this"; INHERIT on a product is "whatever the category says", and OPT_OUT is
   "not an appliance, whatever the category says". */
const NONE = "__none__";
const INHERIT = "__inherit__";
const OPT_OUT = "__optout__";

/**
 * Which equipment group a catalogue category maps to.
 *
 * Saves on pick, like the order status control and for the same reason: a
 * dropdown that has changed and not been saved shows an answer the shop does
 * not hold, which reads exactly like a save that worked.
 */
export function CategoryRecyclingSelect({
  categoryId,
  current,
  groups,
}: {
  categoryId: string;
  current: string | null;
  groups: GroupOption[];
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Select
      value={current ?? NONE}
      disabled={isPending}
      onValueChange={(v) =>
        startTransition(async () => {
          const result = await setCategoryRecyclingAction(categoryId, v === NONE ? null : v);
          if (!result.success) {
            toast.error(result.error ?? "שגיאה בשמירה");
            return;
          }
          toast.success("השיוך עודכן");
        })
      }
    >
      <SelectTrigger size="sm" className="bg-background w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>ללא פינוי</SelectItem>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** One product's own answer, which beats its category's. Three states — see
    setProductRecyclingAction for why the two blanks are not one. */
export function ProductRecyclingSelect({
  productId,
  current,
  optOut,
  groups,
}: {
  productId: string;
  current: string | null;
  optOut: boolean;
  groups: GroupOption[];
}) {
  const [isPending, startTransition] = useTransition();
  const value = optOut ? OPT_OUT : (current ?? INHERIT);

  return (
    <Select
      value={value}
      disabled={isPending}
      onValueChange={(v) =>
        startTransition(async () => {
          const result = await setProductRecyclingAction(productId, {
            recyclingCategoryId: v === INHERIT || v === OPT_OUT ? null : v,
            optOut: v === OPT_OUT,
          });
          if (!result.success) {
            toast.error(result.error ?? "שגיאה בשמירה");
            return;
          }
          toast.success("המוצר עודכן");
        })
      }
    >
      <SelectTrigger size="sm" className="bg-background w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={INHERIT}>לפי הקטגוריה</SelectItem>
        <SelectItem value={OPT_OUT}>לא מוצר חשמלי — ללא פינוי</SelectItem>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
