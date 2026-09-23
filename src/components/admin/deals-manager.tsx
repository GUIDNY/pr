"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { Tag, Search, Plus, X, AlertTriangle, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPrice } from "@/lib/format";
import { searchProductsAction, type SearchResult } from "@/actions/search";
import { startDealAction, updateDealPriceAction, endDealAction } from "@/actions/admin-deals";
import type { DealRow } from "@/lib/queries/admin-deals";

/**
 * The screen that did not exist.
 *
 * A sale on this site is `compareAtPrice IS NOT NULL` and nothing else, so
 * the only way to run one was the product form's "מחיר לפני הנחה" box, one
 * product at a time, with no way to see what was on sale at all. Three
 * products were, and the homepage banner was advertising discounts.
 *
 * Two things this shows that the product form cannot. The discount as a
 * percentage, which is the number being advertised and the one nobody
 * computes correctly in their head from two prices. And whether the deal is
 * actually on the site: the rail applies PUBLIC_PRODUCT_WHERE, so a
 * discounted product with no photograph is a sale that exists only in the
 * database. That row says so, in red, with the reason.
 */
export function DealsManager({ initial }: { initial: DealRow[] }) {
  const [deals, setDeals] = useState(initial);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [picked, setPicked] = useState<SearchResult | null>(null);
  const [salePrice, setSalePrice] = useState("");
  const [isPending, startTransition] = useTransition();

  const live = deals.filter((d) => d.liveOnSite).length;
  const hidden = deals.length - live;

  function search() {
    const q = query.trim();
    if (q.length < 2) return;
    startTransition(async () => {
      const found = await searchProductsAction(q);
      // A product already on sale is edited in the table below, not added
      // again — adding it would refuse anyway, and offering the button is
      // how you learn that one click too late.
      const onSale = new Set(deals.map((d) => d.id));
      setResults(found.filter((r) => !onSale.has(r.id)));
      if (found.length === 0) toast.info("לא נמצאו מוצרים");
    });
  }

  function start() {
    if (!picked) return;
    const value = Number(salePrice);
    startTransition(async () => {
      const result = await startDealAction(picked.id, value);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה");
        return;
      }
      setDeals((prev) => [
        {
          id: picked.id,
          sku: "",
          slug: picked.slug,
          title: picked.title,
          brandName: picked.brandName,
          imageUrl: picked.imageUrl,
          price: value,
          compareAtPrice: picked.price,
          discountPercent: Math.round(((picked.price - value) / picked.price) * 100),
          liveOnSite: true,
          hiddenReason: null,
        },
        ...prev,
      ]);
      setPicked(null);
      setSalePrice("");
      setResults([]);
      setQuery("");
      toast.success("המוצר נכנס למבצע");
    });
  }

  function reprice(row: DealRow, value: number) {
    startTransition(async () => {
      const result = await updateDealPriceAction(row.id, value);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה");
        return;
      }
      setDeals((prev) =>
        prev.map((d) =>
          d.id === row.id
            ? {
                ...d,
                price: value,
                discountPercent: Math.round(((d.compareAtPrice - value) / d.compareAtPrice) * 100),
              }
            : d,
        ),
      );
      toast.success("מחיר המבצע עודכן");
    });
  }

  function end(row: DealRow, mode: "RESTORE" | "KEEP_PRICE") {
    startTransition(async () => {
      const result = await endDealAction(row.id, mode);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה");
        return;
      }
      setDeals((prev) => prev.filter((d) => d.id !== row.id));
      toast.success(
        mode === "RESTORE"
          ? `המבצע הסתיים — המחיר חזר ל-${formatPrice(row.compareAtPrice)}`
          : `המבצע הסתיים — המחיר נשאר ${formatPrice(row.price)}`,
      );
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2.5">
          <Tag className="text-brand size-6" />
          <h1 className="text-2xl font-bold">מוצרים במבצע</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          מה שמופיע ברצועת &quot;מבצעים חמים&quot; בדף הבית ובעמוד המבצעים.{" "}
          {deals.length === 0 ? (
            "אין כרגע אף מוצר במבצע."
          ) : (
            <>
              {live} מוצרים מוצגים באתר
              {hidden > 0 && <span className="text-destructive font-medium">, {hidden} לא מוצגים</span>}.
            </>
          )}
        </p>
        {/* The other screen called "מבצעים" is coupons, and the two get
            confused constantly — same word, unrelated jobs. */}
        <p className="text-muted-foreground mt-1 text-xs">
          מחפשים קודי קופון והנחות עגלה?{" "}
          <Link href="/admin/promotions" className="text-brand underline underline-offset-2">
            עמוד הקופונים
          </Link>
        </p>
      </div>

      <div className="border-border bg-card rounded-xl border p-5">
        <h2 className="mb-3 font-semibold">הוספת מוצר למבצע</h2>
        <div className="flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), search())}
            placeholder="חיפוש לפי שם, מק״ט או דגם"
          />
          <Button variant="outline" onClick={search} disabled={isPending}>
            <Search className="size-4" /> חיפוש
          </Button>
        </div>

        {results.length > 0 && !picked && (
          <ul className="divide-border mt-3 divide-y">
            {results.map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <Thumb url={r.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.title}</p>
                  <p className="text-muted-foreground text-xs">
                    {r.brandName} · {formatPrice(r.price)}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPicked(r)}>
                  <Plus className="size-4" /> בחר
                </Button>
              </li>
            ))}
          </ul>
        )}

        {picked && (
          <div className="border-brand/40 bg-brand/5 mt-3 rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Thumb url={picked.imageUrl} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{picked.title}</p>
                <p className="text-muted-foreground text-xs">מחיר נוכחי: {formatPrice(picked.price)}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPicked(null)} aria-label="ביטול הבחירה">
                <X className="size-4" />
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label className="mb-1.5">מחיר במבצע (₪)</Label>
                <Input
                  type="number"
                  className="w-40"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder={String(Math.round(picked.price * 0.9))}
                />
              </div>
              {Number(salePrice) > 0 && Number(salePrice) < picked.price && (
                <p className="text-success pb-2.5 text-sm font-medium">
                  {Math.round(((picked.price - Number(salePrice)) / picked.price) * 100)}% הנחה ·{" "}
                  חיסכון {formatPrice(picked.price - Number(salePrice))}
                </p>
              )}
              <Button
                variant="brand"
                className="mb-0.5"
                disabled={isPending || !(Number(salePrice) > 0 && Number(salePrice) < picked.price)}
                onClick={start}
              >
                הכנס למבצע
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              המחיר הנוכחי ({formatPrice(picked.price)}) יישמר כמחיר שלפני ההנחה ויוצג מחוק ליד המחיר החדש.
            </p>
          </div>
        )}
      </div>

      {deals.length === 0 ? (
        <div className="border-border text-muted-foreground rounded-xl border border-dashed p-10 text-center text-sm">
          אין מוצרים במבצע. הוסיפו מוצר למעלה והוא יופיע מיד בדף הבית ובעמוד המבצעים.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {deals.map((row) => (
            <DealCard key={row.id} row={row} pending={isPending} onReprice={reprice} onEnd={end} />
          ))}
        </div>
      )}
    </div>
  );
}

function DealCard({
  row,
  pending,
  onReprice,
  onEnd,
}: {
  row: DealRow;
  pending: boolean;
  onReprice: (row: DealRow, value: number) => void;
  onEnd: (row: DealRow, mode: "RESTORE" | "KEEP_PRICE") => void;
}) {
  const [draft, setDraft] = useState(String(row.price));
  const [confirming, setConfirming] = useState(false);
  const changed = Number(draft) !== row.price && Number(draft) > 0;

  return (
    <div className="border-border bg-card rounded-xl border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Thumb url={row.imageUrl} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/products/${row.id}`}
            className="flex items-center gap-1.5 text-sm font-medium hover:underline"
          >
            <span className="truncate">{row.title}</span>
          </Link>
          <p className="text-muted-foreground text-xs">
            {row.brandName}
            {row.sku && ` · מק״ט ${row.sku}`}
          </p>
          {row.hiddenReason && (
            <p className="text-destructive mt-1 flex items-center gap-1.5 text-xs font-medium">
              <AlertTriangle className="size-3.5 shrink-0" />
              לא מוצג באתר — {row.hiddenReason}
            </p>
          )}
        </div>

        <div className="text-end">
          <p className="text-muted-foreground text-xs line-through">{formatPrice(row.compareAtPrice)}</p>
          <p className="text-base font-bold">{formatPrice(row.price)}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-bold ${
            row.discountPercent > 0 ? "bg-brand text-brand-foreground" : "bg-muted text-muted-foreground"
          }`}
        >
          {row.discountPercent}%-
        </span>
        <Link
          href={`/product/${row.slug}`}
          target="_blank"
          className="text-muted-foreground hover:text-brand"
          aria-label="צפייה בעמוד המוצר"
        >
          <ExternalLink className="size-4" />
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
        <Label className="text-xs">מחיר מבצע</Label>
        <Input
          type="number"
          className="w-28"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <Button size="sm" variant="outline" disabled={pending || !changed} onClick={() => onReprice(row, Number(draft))}>
          עדכון
        </Button>

        <div className="flex-1" />

        {/* Two buttons, not one. Ending a sale is either "the price goes back
            up" or "this is the new price" — a single button would have to
            pick one silently, and both mistakes are a wrong price on a live
            shop. */}
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">סיום המבצע:</span>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onEnd(row, "RESTORE")}>
              החזרת המחיר ל-{formatPrice(row.compareAtPrice)}
            </Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => onEnd(row, "KEEP_PRICE")}>
              השארת המחיר {formatPrice(row.price)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              ביטול
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
            <X className="size-4" /> סיום מבצע
          </Button>
        )}
      </div>
    </div>
  );
}

function Thumb({ url }: { url: string | null }) {
  if (!url) return <div className="bg-muted size-12 shrink-0 rounded-lg" />;
  return (
    <Image src={url} alt="" width={48} height={48} className="size-12 shrink-0 rounded-lg object-contain" />
  );
}
