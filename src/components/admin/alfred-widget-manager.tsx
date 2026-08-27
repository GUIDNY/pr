"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import { Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { formatPrice, discountPercent } from "@/lib/format";
import { updateAlfredWidgetPicksAction } from "@/actions/admin-content";

const MAX_PICKS = 3;

type PickerProduct = {
  id: string;
  title: string;
  slug: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
};

export function AlfredWidgetManager({
  products,
  initialSelectedIds,
}: {
  products: PickerProduct[];
  initialSelectedIds: string[];
}) {
  const [selected, setSelected] = useState<string[]>(initialSelectedIds.filter((id) => products.some((p) => p.id === id)));
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim();
    if (!q) return products;
    return products.filter((p) => p.title.includes(q));
  }, [products, search]);

  const selectedProducts = selected
    .map((id) => products.find((p) => p.id === id))
    .filter((p): p is PickerProduct => !!p);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_PICKS) {
        toast.error(`אפשר לבחור עד ${MAX_PICKS} מוצרים`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updateAlfredWidgetPicksAction(selected);
      if (result.success) toast.success("העדכון נשמר — יופיע באתר תוך רגע");
      else toast.error("שגיאה בשמירה");
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        <Sparkles className="text-brand size-6" />
        <div>
          <h1 className="text-2xl font-bold">אלפרד ממליץ — דף הבית</h1>
          <p className="text-muted-foreground text-sm">
            בחרו עד {MAX_PICKS} מבצעים שיוצגו בווידג&apos;ט הצ&apos;אט של אלפרד בראש דף הבית.
          </p>
        </div>
      </div>

      {/* Live preview of the current selection, in pick order — exactly
          what the homepage widget will show. */}
      <div className="border-border bg-card mb-5 rounded-xl border p-4">
        <p className="text-muted-foreground mb-3 text-sm font-medium">נבחרו כעת ({selectedProducts.length}/{MAX_PICKS}):</p>
        {selectedProducts.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            עדיין לא נבחרו מוצרים — יוצגו 3 המבצעים העדכניים ביותר כברירת מחדל.
          </p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {selectedProducts.map((p) => (
              <div key={p.id} className="border-border flex w-40 items-center gap-2 rounded-lg border p-2">
                <div className="bg-muted relative size-10 shrink-0 overflow-hidden rounded-md">
                  {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="40px" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{p.title}</p>
                  <p className="text-brand text-xs font-bold">{formatPrice(p.price)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button variant="brand" size="sm" className="mt-3" onClick={save} disabled={isPending}>
          {isPending ? "שומר..." : "שמירת בחירה"}
        </Button>
      </div>

      <div className="relative mb-3">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש מוצר לפי שם..."
          className="ps-9"
        />
      </div>

      <div className="border-border bg-card divide-border max-h-[32rem] divide-y overflow-y-auto rounded-xl border">
        {filtered.length === 0 ? (
          <p className="text-muted-foreground p-6 text-center text-sm">לא נמצאו מוצרים במבצע התואמים לחיפוש</p>
        ) : (
          filtered.map((p) => {
            const pct = discountPercent(p.price, p.compareAtPrice ?? undefined);
            const checked = selected.includes(p.id);
            return (
              <label
                key={p.id}
                className="hover:bg-muted/50 flex cursor-pointer items-center gap-3 px-4 py-2.5"
              >
                <Checkbox checked={checked} onCheckedChange={() => toggle(p.id)} />
                <div className="bg-muted relative size-11 shrink-0 overflow-hidden rounded-md">
                  {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="44px" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatPrice(p.price)}
                    {pct ? ` · ${pct}% הנחה` : ""}
                  </p>
                </div>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
