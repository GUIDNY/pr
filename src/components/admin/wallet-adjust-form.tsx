"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adjustWalletAction } from "@/actions/admin-wallet";
import { formatPrice } from "@/lib/format";

/** The owner's manual line on a customer's balance. See adjustWalletAction. */
export function WalletAdjustForm() {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  return (
    <form
      className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_140px_1fr_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await adjustWalletAction({ email, amount: Number(amount), note });
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success(`עודכן. יתרה חדשה: ${formatPrice(result.balance / 100, { decimals: true })}`);
          setAmount("");
          setNote("");
        });
      }}
    >
      <div>
        <Label className="mb-1.5">מייל הלקוח</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" required />
      </div>
      <div>
        <Label className="mb-1.5">סכום ₪ (שלילי להפחתה)</Label>
        <Input value={amount} onChange={(e) => setAmount(e.target.value)} dir="ltr" inputMode="decimal" required />
      </div>
      <div>
        <Label className="mb-1.5">סיבה</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} required />
      </div>
      <Button type="submit" variant="brand" disabled={pending}>
        {pending ? "מעדכן…" : "עדכון יתרה"}
      </Button>
    </form>
  );
}
