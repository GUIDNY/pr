"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProductAction, updateProductAction } from "@/actions/admin-products";
import { STOCK_STATUSES, STOCK_STATUS_LABELS } from "@/lib/enums";
import type { ProductInput } from "@/lib/product-schema";

type Options = {
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
};

export function ProductForm({
  mode,
  productId,
  initial,
  options,
}: {
  mode: "create" | "edit";
  productId?: string;
  initial: ProductInput;
  options: Options;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function update<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create" ? await createProductAction(form) : await updateProductAction(productId!, form);
      if (result && !result.success) {
        setError(result.error ?? "שגיאה בשמירה");
        return;
      }
      if (mode === "edit") {
        toast.success("המוצר עודכן");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="border-border bg-card grid grid-cols-1 gap-4 rounded-xl border p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Label className="mb-1.5">שם מוצר</Label>
          <Input value={form.title} onChange={(e) => update("title", e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5">Slug (כתובת URL)</Label>
          <Input value={form.slug} onChange={(e) => update("slug", e.target.value)} dir="ltr" />
        </div>
        <div>
          <Label className="mb-1.5">מק&quot;ט (SKU)</Label>
          <Input value={form.sku} onChange={(e) => update("sku", e.target.value)} dir="ltr" />
        </div>
        <div>
          <Label className="mb-1.5">דגם</Label>
          <Input value={form.model ?? ""} onChange={(e) => update("model", e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5">מותג</Label>
          <Select value={form.brandId} onValueChange={(v) => update("brandId", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="בחר מותג" />
            </SelectTrigger>
            <SelectContent>
              {options.brands.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5">קטגוריה</Label>
          <Select value={form.categoryId} onValueChange={(v) => update("categoryId", v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="בחר קטגוריה" />
            </SelectTrigger>
            <SelectContent>
              {options.categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5">ספק</Label>
          <Select value={form.supplierId ?? "NONE"} onValueChange={(v) => update("supplierId", v === "NONE" ? undefined : v)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="ללא ספק" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">ללא</SelectItem>
              {options.suppliers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border-border bg-card grid grid-cols-2 gap-4 rounded-xl border p-5 sm:grid-cols-4">
        <div>
          <Label className="mb-1.5">מחיר (₪)</Label>
          <Input type="number" value={form.price} onChange={(e) => update("price", Number(e.target.value))} />
        </div>
        <div>
          <Label className="mb-1.5">מחיר לפני הנחה</Label>
          <Input
            type="number"
            value={form.compareAtPrice ?? ""}
            onChange={(e) => update("compareAtPrice", e.target.value ? Number(e.target.value) : null)}
          />
        </div>
        <div>
          <Label className="mb-1.5">כמות במלאי</Label>
          <Input type="number" value={form.stockQty} onChange={(e) => update("stockQty", Number(e.target.value))} />
        </div>
        <div>
          <Label className="mb-1.5">סטטוס מלאי</Label>
          <Select value={form.stockStatus} onValueChange={(v) => update("stockStatus", v as ProductInput["stockStatus"])}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STOCK_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STOCK_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="mb-1.5">אחריות (חודשים)</Label>
          <Input type="number" value={form.warrantyMonths} onChange={(e) => update("warrantyMonths", Number(e.target.value))} />
        </div>
        <div>
          <Label className="mb-1.5">זמן אספקה (ימים)</Label>
          <Input type="number" value={form.deliveryDays} onChange={(e) => update("deliveryDays", Number(e.target.value))} />
        </div>
      </div>

      <div className="border-border bg-card flex flex-col gap-4 rounded-xl border p-5">
        <div>
          <Label className="mb-1.5">תיאור קצר</Label>
          <Textarea rows={2} value={form.shortDescription ?? ""} onChange={(e) => update("shortDescription", e.target.value)} />
        </div>
        <div>
          <Label className="mb-1.5">תיאור מלא</Label>
          <Textarea rows={5} value={form.description ?? ""} onChange={(e) => update("description", e.target.value)} />
        </div>
      </div>

      <div className="border-border bg-card flex flex-wrap gap-6 rounded-xl border p-5">
        <label className="flex items-center gap-2">
          <Switch checked={form.isPublished} onCheckedChange={(v) => update("isPublished", v)} />
          <span className="text-sm font-medium">פורסם באתר</span>
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={form.isFeatured} onCheckedChange={(v) => update("isFeatured", v)} />
          <span className="text-sm font-medium">מומלץ</span>
        </label>
        <label className="flex items-center gap-2">
          <Switch checked={form.isBestSeller} onCheckedChange={(v) => update("isBestSeller", v)} />
          <span className="text-sm font-medium">נמכר ביותר</span>
        </label>
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <Button variant="brand" size="lg" onClick={submit} disabled={isPending} className="w-fit">
        {isPending ? "שומר..." : mode === "create" ? "יצירת מוצר" : "שמירת שינויים"}
      </Button>
    </div>
  );
}
