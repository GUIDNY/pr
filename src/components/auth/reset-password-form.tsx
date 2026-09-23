"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/actions/auth";

/** Choosing the new password, from a link that has already been checked once. */
export function ResetPasswordForm({ token }: { token: string }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("שתי הסיסמאות אינן זהות");
      return;
    }
    startTransition(async () => {
      const result = await resetPasswordAction({ token, newPassword });
      if (!result.success) {
        setError(result.error ?? "שגיאה בשמירה");
        return;
      }
      toast.success("הסיסמה עודכנה");
      // A real page load, not a router push: the session cookie was just set
      // and every cached client view of "who is this" has to be rebuilt.
      window.location.assign(new URL("/account", window.location.origin).toString());
    });
  }

  const field = (id: string, label: string, value: string, onChange: (v: string) => void) => (
    <div>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      <div dir="ltr" className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete="new-password"
          dir="ltr"
          className="h-11 pe-11 text-start"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "הסתרת הסיסמאות" : "הצגת הסיסמאות"}
          className="text-muted-foreground hover:text-foreground absolute end-0 top-0 flex h-11 w-11 items-center justify-center"
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {field("newPassword", "סיסמה חדשה", newPassword, setNewPassword)}
      {field("confirmPassword", "אישור הסיסמה", confirm, setConfirm)}

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
          <Link href="/forgot-password" className="mt-1 block font-bold underline">
            בקשת קישור חדש
          </Link>
        </p>
      )}

      <Button type="submit" variant="brand" size="lg" disabled={isPending} className="h-12 text-base font-bold">
        {isPending ? "שומר…" : "שמירת הסיסמה"}
      </Button>
    </form>
  );
}
