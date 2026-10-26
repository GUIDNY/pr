"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createManualOrderAction, searchProductsForOrderAction } from "@/actions/admin-manual-order";
import {
  DELIVERY_METHODS,
  DELIVERY_METHOD_LABELS,
  MANUAL_PAYMENT_METHODS,
  MANUAL_PAYMENT_METHOD_LABELS,
  type DeliveryMethod,
  type ManualPaymentMethod,
} from "@/lib/enums";
import { requiresAddress } from "@/lib/delivery";
import { manualOrderTotals, MANUAL_ORDER_MAX_LINES } from "@/lib/manual-order";
import { formatPrice } from "@/lib/format";

/**
 * Typing in a sale that happened on the phone.
 *
 * Laid out in the order the call goes: what they want, who they are, where
 * it goes, what they paid. The margin sits at the bottom and updates as the
 * prices are typed, because the one thing this form can get expensively
 * wrong is a price agreed below cost — and the moment to notice that is
 * while the customer is still on the line, not in a report next month.
 */

type Found = {
  id: string;
  title: string;
  sku: string;
  price: number;
  supplierCost: number | null;
  stockQty: number;
  isPublished: boolean;
};

type Line = { product: Found; quantity: number; unitPrice: number };

export function ManualOrderForm() {
  const router = useRouter();
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [searching, startSearch] = useTransition();

  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("DELIVERY");
  const [city, setCity] = useState("");
  const [street, setStreet] = useState("");
  const [houseNo, setHouseNo] = useState("");
  const [apartment, setApartment] = useState("");
  const [deliveryFee, setDeliveryFee] = useState("0");
  const [deliveryCost, setDeliveryCost] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paid, setPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<ManualPaymentMethod | "">("");
  const [paymentReference, setPaymentReference] = useState("");
  const [saving, startSave] = useTransition();

  /* Debounced, and the clearing lives in the input handler rather than in
     an effect that reacts to what it just set. */
  useEffect(() => {
    if (query.trim().length < 2) return;
    const timer = setTimeout(() => {
      startSearch(async () => setResults(await searchProductsForOrderAction(query)));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const needsAddress = requiresAddress(deliveryMethod);
  const fee = Number(deliveryFee) || 0;
  const cost = deliveryCost.trim() === "" ? null : Number(deliveryCost) || 0;

  const totals = useMemo(
    () =>
      manualOrderTotals(
        lines.map((l) => ({
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          unitCost: l.product.supplierCost && l.product.supplierCost > 0 ? l.product.supplierCost : null,
        })),
        fee,
        cost,
      ),
    [lines, fee, cost],
  );

  function addProduct(product: Found) {
    setQuery("");
    setResults([]);
    setLines((prev) => {
      if (prev.some((l) => l.product.id === product.id)) {
        toast.info("המוצר כבר ברשימה — אפשר לשנות כמות");
        return prev;
      }
      if (prev.length >= MANUAL_ORDER_MAX_LINES) {
        toast.error(`עד ${MANUAL_ORDER_MAX_LINES} פריטים בהזמנה`);
        return prev;
      }
      return [...prev, { product, quantity: 1, unitPrice: product.price }];
    });
  }

  function patchLine(id: string, patch: Partial<Omit<Line, "product">>) {
    setLines((prev) => prev.map((l) => (l.product.id === id ? { ...l, ...patch } : l)));
  }

  function submit() {
    startSave(async () => {
      const result = await createManualOrderAction({
        lines: lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        customerName,
        customerPhone,
        customerEmail: customerEmail || undefined,
        deliveryMethod,
        city,
        street,
        houseNo,
        apartment,
        deliveryFee: fee,
        deliveryCost: cost,
        customerNote,
        paid,
        paymentMethod: paid && paymentMethod ? paymentMethod : undefined,
        paymentReference,
      });
      if (!result.success || !result.orderNumber) {
        toast.error(result.error ?? "שמירת ההזמנה נכשלה");
        return;
      }
      toast.success(`נוצרה הזמנה ${result.orderNumber}`);
      router.push(`/admin/orders/${result.orderNumber}`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── what they want ─────────────────────────────────────────── */}
      <section className="border-border bg-card rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-bold">פריטים</h2>

        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 start-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (e.target.value.trim().length < 2) setResults([]);
            }}
            placeholder="חיפוש לפי שם, מק״ט או דגם"
            className="ps-9"
          />
          {query.trim().length >= 2 && (
            <div className="border-border bg-card absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-lg border shadow-lg">
              {searching && results.length === 0 && (
                <p className="text-muted-foreground p-3 text-sm">מחפש…</p>
              )}
              {!searching && results.length === 0 && (
                <p className="text-muted-foreground p-3 text-sm">לא נמצאו מוצרים.</p>
              )}
              {results.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProduct(product)}
                  className="hover:bg-muted flex w-full items-center justify-between gap-3 p-3 text-start text-sm"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{product.title}</span>
                    <span className="text-muted-foreground block text-xs">
                      {product.sku} · {formatPrice(product.price)}
                      {" · "}
                      {/* Both shown, because a phone order is very often for
                          exactly the product that fails one of them. */}
                      {product.stockQty > 0 ? `${product.stockQty} במלאי` : "אין במלאי"}
                      {!product.isPublished && " · לא מפורסם"}
                    </span>
                  </span>
                  <Plus className="size-4 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="text-muted-foreground border-border mt-3 rounded-lg border border-dashed p-6 text-center text-sm">
            חפשו מוצר כדי להוסיף אותו להזמנה.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {lines.map((line) => {
              const unitCost =
                line.product.supplierCost && line.product.supplierCost > 0 ? line.product.supplierCost : null;
              const belowCost = unitCost !== null && line.unitPrice < unitCost;
              return (
                <li
                  key={line.product.id}
                  className="border-border flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-[12rem] flex-1">
                    <p className="text-sm font-medium">{line.product.title}</p>
                    <p className="text-muted-foreground text-xs">
                      {line.product.sku}
                      {unitCost !== null ? ` · עלות ${formatPrice(unitCost)}` : " · אין עלות רשומה"}
                    </p>
                  </div>

                  <div className="w-20">
                    <Label className="mb-1 text-xs">כמות</Label>
                    <Input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        patchLine(line.product.id, { quantity: Math.max(1, Number(e.target.value) || 1) })
                      }
                    />
                  </div>

                  <div className="w-28">
                    <Label className="mb-1 text-xs">מחיר ליח׳</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) =>
                        patchLine(line.product.id, { unitPrice: Math.max(0, Number(e.target.value) || 0) })
                      }
                      className={belowCost ? "border-destructive text-destructive" : undefined}
                    />
                  </div>

                  <div className="w-24 text-end">
                    <Label className="mb-1 text-xs">סה״כ</Label>
                    <p className="py-2 text-sm font-bold">{formatPrice(line.unitPrice * line.quantity)}</p>
                  </div>

                  {belowCost && (
                    <Badge variant="destructive" className="order-last">
                      מתחת לעלות
                    </Badge>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setLines((prev) => prev.filter((l) => l.product.id !== line.product.id))}
                    aria-label={`הסר ${line.product.title}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── who they are ───────────────────────────────────────────── */}
      <section className="border-border bg-card rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-bold">הלקוח</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5">שם *</Label>
            <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5">טלפון *</Label>
            <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} inputMode="tel" />
          </div>
          <div>
            <Label className="mb-1.5">אימייל</Label>
            <Input
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              inputMode="email"
              placeholder="לא חובה"
            />
          </div>
        </div>
      </section>

      {/* ── where it goes ──────────────────────────────────────────── */}
      <section className="border-border bg-card rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-bold">מסירה</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="mb-1.5">אופן מסירה</Label>
            <Select value={deliveryMethod} onValueChange={(v) => setDeliveryMethod(v as DeliveryMethod)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {DELIVERY_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="mb-1.5">דמי משלוח ללקוח</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5">עלות המשלוח לנו</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={deliveryCost}
              onChange={(e) => setDeliveryCost(e.target.value)}
              placeholder="אפשר למלא אחר כך"
            />
          </div>
        </div>

        {needsAddress && (
          <div className="mt-3 grid gap-3 sm:grid-cols-4">
            <div>
              <Label className="mb-1.5">עיר *</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">רחוב *</Label>
              <Input value={street} onChange={(e) => setStreet(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">מספר *</Label>
              <Input value={houseNo} onChange={(e) => setHouseNo(e.target.value)} />
            </div>
            <div>
              <Label className="mb-1.5">דירה</Label>
              <Input value={apartment} onChange={(e) => setApartment(e.target.value)} />
            </div>
          </div>
        )}

        <div className="mt-3">
          <Label className="mb-1.5">הערה להזמנה</Label>
          <Textarea
            value={customerNote}
            onChange={(e) => setCustomerNote(e.target.value)}
            rows={2}
            placeholder="מה שסוכם בטלפון — מועד, קומה, בקשה מיוחדת"
          />
        </div>
      </section>

      {/* ── what they paid ─────────────────────────────────────────── */}
      <section className="border-border bg-card rounded-xl border p-4">
        <h2 className="mb-3 text-lg font-bold">תשלום</h2>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-sm font-semibold">
          <input
            type="checkbox"
            checked={paid}
            onChange={(e) => setPaid(e.target.checked)}
            className="accent-brand size-4 cursor-pointer"
          />
          הלקוח כבר שילם
        </label>

        {paid && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5">איך שילם *</Label>
              <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as ManualPaymentMethod)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="בחרו אמצעי" />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {MANUAL_PAYMENT_METHOD_LABELS[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-1.5">אסמכתה</Label>
              <Input
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                placeholder="4 ספרות אחרונות, מספר העברה…"
              />
            </div>
          </div>
        )}

        <p className="text-muted-foreground mt-3 text-xs">
          הלקוח לא מקבל שום הודעה מיצירת ההזמנה. שליחה נעשית מדף ההזמנה, בלחיצה.
        </p>
      </section>

      {/* ── the money ──────────────────────────────────────────────── */}
      <section className="border-border bg-card sticky bottom-3 rounded-xl border p-4 shadow-lg">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            <dt className="text-muted-foreground">סכום ביניים</dt>
            <dd className="font-medium">{formatPrice(totals.subtotal)}</dd>
            <dt className="text-muted-foreground">משלוח</dt>
            <dd className="font-medium">{fee > 0 ? formatPrice(fee) : "ללא חיוב"}</dd>
            <dt className="font-bold">סה״כ להזמנה</dt>
            <dd className="text-lg font-black">{formatPrice(totals.total)}</dd>
            <dt className="text-muted-foreground">רווח</dt>
            <dd
              className={
                totals.margin === null
                  ? "text-muted-foreground"
                  : totals.margin < 0
                    ? "text-destructive font-bold"
                    : "font-bold text-green-600"
              }
            >
              {totals.margin === null
                ? "אין עלות רשומה לכל הפריטים"
                : `${formatPrice(totals.margin)}${totals.marginPct !== null ? ` · ${totals.marginPct}%` : ""}`}
              {totals.margin !== null && cost === null && (
                <span className="text-muted-foreground block text-xs">לפני עלות משלוח</span>
              )}
            </dd>
          </dl>

          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" onClick={() => router.push("/admin/orders")} disabled={saving}>
              <X className="size-4" /> ביטול
            </Button>
            <Button type="button" onClick={submit} disabled={saving || lines.length === 0}>
              {saving ? "שומר…" : "צור הזמנה"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
