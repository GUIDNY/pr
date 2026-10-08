"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, AlertTriangle, Check, X, ExternalLink } from "lucide-react";
import type { PriceRow } from "@/lib/queries/price-list";
import { updateSalePriceAction } from "@/actions/price-list";
import { formatPrice } from "@/lib/format";

/**
 * The price sheet, and the two presses it takes to change a line of it.
 *
 * A price is the one field on a product that is wrong in public the moment
 * it is wrong at all — it is on the page, in the Google feed and in the
 * JSON-LD — and this screen puts 2,189 of them one keystroke apart. So
 * editing is a mode, not a state: a row is read-only until its pencil is
 * pressed, and a typed number is still not saved until a second press
 * against a panel that spells out the old price, the new one, and what the
 * margin becomes. Two presses with the consequence written between them,
 * rather than a confirm dialog that says "are you sure" and teaches people
 * to press yes.
 */
export function PriceListTable({ rows }: { rows: PriceRow[] }) {
  return (
    <div className="border-border overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-muted-foreground">
          <tr>
            <th className="p-3 text-start font-semibold">מוצר</th>
            <th className="p-3 text-start font-semibold whitespace-nowrap">מחיר עלות</th>
            <th className="p-3 text-start font-semibold whitespace-nowrap">מחיר מכירה</th>
            <th className="p-3 text-start font-semibold whitespace-nowrap">רווח</th>
            <th className="p-3 text-start font-semibold"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <PriceRowLine key={row.id} row={row} />
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="text-muted-foreground p-6 text-center">
                אין מוצרים שמתאימים לחיפוש
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function PriceRowLine({ row }: { row: PriceRow }) {
  const [price, setPrice] = useState(row.price);
  const [draft, setDraft] = useState("");
  const [stage, setStage] = useState<"idle" | "editing" | "confirming">("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const cost = row.supplierCost;
  const typed = Number(draft.replace(/,/g, ""));
  const nextValid = Number.isFinite(typed) && typed > 0;
  const margin = (p: number) => (cost === null ? null : p - cost);
  const marginPct = (p: number) => (cost === null || p <= 0 ? null : ((p - cost) / p) * 100);
  const belowCost = cost !== null && price < cost;

  function open() {
    setDraft(String(price));
    setError(null);
    setStage("editing");
  }
  function cancel() {
    setStage("idle");
    setDraft("");
    setError(null);
  }
  function save() {
    start(async () => {
      const result = await updateSalePriceAction(row.id, typed);
      if (!result.success) {
        setError(result.error ?? "השמירה נכשלה");
        setStage("editing");
        return;
      }
      setPrice(result.price ?? typed);
      cancel();
    });
  }

  return (
    <>
      <tr className={`border-border border-t ${belowCost ? "bg-destructive/5" : ""}`}>
        <td className="p-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium">{row.title}</p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {row.brand && <span>{row.brand} · </span>}
                מק״ט {row.sku}
                {!row.isPublished && <span className="text-warning-foreground"> · לא מפורסם</span>}
                {row.stockQty <= 0 && <span> · אזל</span>}
              </p>
            </div>
            <Link
              href={`/product/${row.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground mt-0.5 shrink-0"
              aria-label="פתח את דף המוצר"
            >
              <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </td>
        <td className="p-3 whitespace-nowrap">
          {cost === null ? <span className="text-muted-foreground">—</span> : formatPrice(cost)}
        </td>
        <td className="p-3 font-semibold whitespace-nowrap">{formatPrice(price)}</td>
        <td className="p-3 whitespace-nowrap">
          {margin(price) === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={belowCost ? "text-destructive font-semibold" : ""}>
              {formatPrice(margin(price)!)}
              <span className="text-muted-foreground"> · {marginPct(price)!.toFixed(0)}%</span>
            </span>
          )}
        </td>
        <td className="p-3 text-end">
          {stage === "idle" && (
            <button
              type="button"
              onClick={open}
              className="border-border hover:bg-muted inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold"
            >
              <Pencil className="size-3.5" /> ערוך מחיר
            </button>
          )}
        </td>
      </tr>

      {stage !== "idle" && (
        <tr className="border-border bg-muted/30 border-t">
          <td colSpan={5} className="p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm font-semibold" htmlFor={`price-${row.id}`}>
                  מחיר מכירה חדש
                </label>
                <input
                  id={`price-${row.id}`}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    setStage("editing");
                    setError(null);
                  }}
                  inputMode="decimal"
                  dir="ltr"
                  className="border-border w-32 rounded-lg border px-3 py-2 text-sm"
                />
                <span className="text-muted-foreground text-sm">
                  במקום {formatPrice(price)}
                  {cost !== null && <> · עלות {formatPrice(cost)}</>}
                </span>
                <button
                  type="button"
                  onClick={cancel}
                  className="text-muted-foreground hover:text-foreground ms-auto inline-flex items-center gap-1 text-xs font-semibold"
                >
                  <X className="size-3.5" /> ביטול
                </button>
              </div>

              {error && <p className="text-destructive text-sm font-semibold">{error}</p>}

              {/* The second press, and what it is for: the numbers it will
                  produce, said before it happens rather than after. */}
              {stage === "editing" ? (
                <button
                  type="button"
                  disabled={!nextValid || typed === price}
                  onClick={() => setStage("confirming")}
                  className="bg-brand text-brand-foreground w-fit rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                >
                  המשך לאישור
                </button>
              ) : (
                <div className="border-brand/40 bg-background flex flex-col gap-2 rounded-xl border p-3">
                  <p className="flex items-center gap-2 text-sm font-bold">
                    <AlertTriangle className="text-warning-foreground size-4" />
                    המחיר יתעדכן באתר באופן מיידי
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {formatPrice(price)} ← <strong className="text-foreground">{formatPrice(typed)}</strong>
                    {cost !== null && (
                      <>
                        {" · "}רווח {formatPrice(typed - cost)} ({(((typed - cost) / typed) * 100).toFixed(0)}%)
                        {typed < cost && <strong className="text-destructive"> — מתחת למחיר העלות</strong>}
                      </>
                    )}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={save}
                      className="bg-brand text-brand-foreground inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-bold disabled:opacity-50"
                    >
                      <Check className="size-4" />
                      {pending ? "שומר…" : "אשר ושמור"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStage("editing")}
                      className="border-border rounded-lg border px-4 py-2 text-sm"
                    >
                      חזור
                    </button>
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
