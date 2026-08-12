"use client";

import { useState, useTransition } from "react";
import { Plus, Truck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { createSupplierAction, toggleSupplierActiveAction } from "@/actions/admin-catalog";

type Supplier = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  leadTimeDays: number;
  isActive: boolean;
  _count?: { products: number };
};

export function SuppliersManager({ initial }: { initial: Supplier[] }) {
  const [suppliers, setSuppliers] = useState(initial);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ name: "", contactName: "", phone: "", email: "", leadTimeDays: "7" });

  function submit() {
    startTransition(async () => {
      const result = await createSupplierAction({ ...form, leadTimeDays: Number(form.leadTimeDays) });
      if (!result.success) {
        toast.error(result.error ?? "שגיאה ביצירת ספק");
        return;
      }
      toast.success("הספק נוצר");
      setOpen(false);
      window.location.reload();
    });
  }

  function toggle(id: string, next: boolean) {
    startTransition(async () => {
      await toggleSupplierActiveAction(id, next);
      setSuppliers((s) => s.map((x) => (x.id === id ? { ...x, isActive: next } : x)));
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">ספקים</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="brand" size="sm" className="gap-1.5">
              <Plus className="size-4" /> ספק חדש
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>ספק חדש</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-3 py-2">
              <div>
                <Label className="mb-1.5">שם הספק</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5">איש קשר</Label>
                <Input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="mb-1.5">טלפון</Label>
                  <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                </div>
                <div>
                  <Label className="mb-1.5">זמן אספקה (ימים)</Label>
                  <Input type="number" value={form.leadTimeDays} onChange={(e) => setForm((f) => ({ ...f, leadTimeDays: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label className="mb-1.5">אימייל</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="brand" onClick={submit} disabled={isPending}>
                {isPending ? "יוצר..." : "יצירת ספק"}
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
              <TableHead>איש קשר</TableHead>
              <TableHead>טלפון</TableHead>
              <TableHead>זמן אספקה</TableHead>
              <TableHead>מוצרים</TableHead>
              <TableHead>פעיל</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground py-10 text-center">
                  <Truck className="mx-auto mb-2 size-8 opacity-40" />
                  אין ספקים עדיין
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.contactName ?? "—"}</TableCell>
                  <TableCell dir="ltr">{s.phone ?? "—"}</TableCell>
                  <TableCell>{s.leadTimeDays} ימים</TableCell>
                  <TableCell>{s._count?.products ?? 0}</TableCell>
                  <TableCell>
                    <Switch checked={s.isActive} onCheckedChange={(v) => toggle(s.id, v)} disabled={isPending} />
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
