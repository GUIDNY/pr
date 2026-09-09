"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteAccountAction } from "@/actions/auth";

/**
 * Two steps on purpose. The first click only reveals the password field, so
 * the button that actually deletes the account can never be the button a
 * thumb lands on by accident while scrolling the account page.
 */
export function DeleteAccountForm() {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await deleteAccountAction({ password });
      if (!result.success) {
        setError(result.error ?? "מחיקת החשבון נכשלה");
        return;
      }
      toast.success("החשבון נמחק");
      // The session cookie is already cleared on the server; refresh so the
      // header and the cart stop showing a customer who no longer exists.
      router.push("/");
      router.refresh();
    });
  }

  if (!armed) {
    return (
      <Button variant="destructive" onClick={() => setArmed(true)}>
        <Trash2 />
        מחיקת החשבון
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="delete-password">הזינו את הסיסמה כדי לאשר</Label>
        <Input
          id="delete-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          className="max-w-sm"
        />
      </div>

      {error && <p className="text-destructive text-sm">{error}</p>}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="destructive" disabled={isPending || !password}>
          <Trash2 />
          {isPending ? "מוחק…" : "מחיקה סופית"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setArmed(false);
            setPassword("");
            setError(null);
          }}
          disabled={isPending}
        >
          ביטול
        </Button>
      </div>
    </form>
  );
}
