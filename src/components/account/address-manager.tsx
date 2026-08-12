"use client";

import { useState, useTransition } from "react";
import { MapPin, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { addAddressAction, deleteAddressAction, setDefaultAddressAction } from "@/actions/addresses";

type Address = {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  street: string;
  houseNo: string;
  apartment: string | null;
  isDefault: boolean;
};

export function AddressManager({ initialAddresses }: { initialAddresses: Address[] }) {
  const [addresses, setAddresses] = useState(initialAddresses);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({ fullName: "", phone: "", city: "", street: "", houseNo: "", apartment: "" });

  function submit() {
    startTransition(async () => {
      const result = await addAddressAction(form);
      if (!result.success) {
        toast.error(result.error ?? "שגיאה בהוספת כתובת");
        return;
      }
      toast.success("הכתובת נוספה");
      setOpen(false);
      setForm({ fullName: "", phone: "", city: "", street: "", houseNo: "", apartment: "" });
      window.location.reload();
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteAddressAction(id);
      setAddresses((a) => a.filter((addr) => addr.id !== id));
    });
  }

  function setDefault(id: string) {
    startTransition(async () => {
      await setDefaultAddressAction(id);
      setAddresses((a) => a.map((addr) => ({ ...addr, isDefault: addr.id === id })));
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">כתובות</h1>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="brand" size="sm" className="gap-1.5">
              <Plus className="size-4" /> כתובת חדשה
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>כתובת חדשה</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-2">
              <div className="col-span-2">
                <Label className="mb-1.5">שם מלא</Label>
                <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5">טלפון</Label>
                <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5">עיר</Label>
                <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label className="mb-1.5">רחוב</Label>
                <Input value={form.street} onChange={(e) => setForm((f) => ({ ...f, street: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5">מספר בית</Label>
                <Input value={form.houseNo} onChange={(e) => setForm((f) => ({ ...f, houseNo: e.target.value }))} />
              </div>
              <div>
                <Label className="mb-1.5">דירה</Label>
                <Input value={form.apartment} onChange={(e) => setForm((f) => ({ ...f, apartment: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="brand" onClick={submit} disabled={isPending}>
                {isPending ? "שומר..." : "שמירת כתובת"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {addresses.length === 0 ? (
        <div className="border-border flex flex-col items-center gap-3 rounded-xl border p-12 text-center">
          <MapPin className="text-muted-foreground/40 size-12" strokeWidth={1} />
          <p className="text-muted-foreground text-sm">עדיין לא הוספתם כתובות</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.map((addr) => (
            <li key={addr.id} className="border-border flex items-start justify-between gap-3 rounded-xl border p-4">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium">{addr.fullName}</p>
                  {addr.isDefault && (
                    <span className="bg-brand/10 text-brand rounded-full px-2 py-0.5 text-xs font-medium">ברירת מחדל</span>
                  )}
                </div>
                <p className="text-muted-foreground mt-0.5 text-sm">
                  {addr.city}, {addr.street} {addr.houseNo}
                  {addr.apartment ? `, דירה ${addr.apartment}` : ""}
                </p>
                <p className="text-muted-foreground text-sm">{addr.phone}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!addr.isDefault && (
                  <button
                    onClick={() => setDefault(addr.id)}
                    className="text-muted-foreground hover:text-brand"
                    aria-label="הגדר כברירת מחדל"
                    title="הגדר כברירת מחדל"
                  >
                    <Star className="size-4" />
                  </button>
                )}
                <button onClick={() => remove(addr.id)} className="text-muted-foreground hover:text-destructive" aria-label="מחק כתובת">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
