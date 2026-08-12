"use client";

import { useState, useTransition } from "react";
import { Plus, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createPromotionAction, togglePromotionAction } from "@/actions/admin-catalog";

type Promotion = {
  id: string;
  name: string;
  code: string | null;
  type: string;
  value: number;
  scope: string;
  isActive: boolean;
};

const SCOPE_LABELS: Record<string, string> = { CART: "עגלה", CATEGORY: "קטגוריה", BRAND: "מותג", PRODUCT: "מוצר" };

export function PromotionsManager({ initial }: { initial: Promotion[] }) {
  const [promotions, setPromotions] = useState(initial);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", code: "", type: "PERCENTAGE" as "PERCENTAGE" | "FIXED", value: "", scope: "CART" as "CART" | "CATEGORY" | "BRAND" | "PRODUCT", minCartAmount: "" });

  function submit() {
    startTransition(async () => {
      const result = await createPromotionAction({
        name: form.name,
        code: form.code || undefined,
        type: form.type,
        value: Number(form.value),
        scope: form.scope,
        minCartAmount: form.minCartAmount ? Number(form.minCartAmount) : undefined,
      });
      if (!result.success) {
        toast.error(result.error ?? "שגיאה ביצירת מבצע");
        return;
      }
      toast.success("המבצע נוצר");
      setOpen(false);
      window.location.reload();
    });
  }

  function toggle(id: string, next: boolean) {
    startTransition(async () => {
      await togglePromotionAction(id, next);
      setPromotions((p) => p.map((x) => (x.id === id ? { ...x, isActive: next } : x)));
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">מבצעים וקופונים</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="brand" size="sm" className="gap-1.5">
              <Plus className="size-4" /> מבצע חדש
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>מבצע חדש</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div>
                <Label className="mb-1.5">שם המבצע</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5">קוד קופון (אופציונלי)</Label>
                <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} dir="ltr" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">סוג הנחה</Label>
                  <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as "PERCENTAGE" | "FIXED" }))}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENTAGE">אחוז</SelectItem>
                      <SelectItem value="FIXED">סכום קבוע</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5">ערך</Label>
                  <Input type="number" value={form.value} onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="mb-1.5">תחולה</Label>
                <Select value={form.scope} onValueChange={(v) => setForm((f) => ({ ...f, scope: v as typeof form.scope }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CART">כל העגלה</SelectItem>
                    <SelectItem value="CATEGORY">קטגוריה</SelectItem>
                    <SelectItem value="BRAND">מותג</SelectItem>
                    <SelectItem value="PRODUCT">מוצר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1.5">סכום עגלה מינימלי (אופציונלי)</Label>
                <Input type="number" value={form.minCartAmount} onChange={(e) => setForm((f) => ({ ...f, minCartAmount: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="brand" onClick={submit} disabled={isPending}>
                {isPending ? "יוצר..." : "יצירת מבצע"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border-border bg-card overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>שם</TableHead>
              <TableHead>קוד</TableHead>
              <TableHead>הנחה</TableHead>
              <TableHead>תחולה</TableHead>
              <TableHead>פעיל</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground py-10 text-center">
                  <Tag className="mx-auto mb-2 size-8 opacity-40" />
                  אין מבצעים עדיין
                </TableCell>
              </TableRow>
            ) : (
              promotions.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell dir="ltr">{p.code ?? "—"}</TableCell>
                  <TableCell>{p.type === "PERCENTAGE" ? `${p.value}%` : `₪${p.value}`}</TableCell>
                  <TableCell>{SCOPE_LABELS[p.scope]}</TableCell>
                  <TableCell>
                    <Switch checked={p.isActive} onCheckedChange={(v) => toggle(p.id, v)} disabled={isPending} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
