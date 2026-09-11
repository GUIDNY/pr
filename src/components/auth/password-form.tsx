"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { setPasswordAction } from "@/actions/auth";

/**
 * Setting a password, for somebody who has one and for somebody who does not.
 *
 * `hasPassword` decides whether the current-password field is here at all.
 * It is not a hint: the server makes the same decision from the account row,
 * so a form that leaves the field out cannot skip the check on an account
 * that does have a password.
 *
 * Someone who signed up through Google has nothing to prove here — being
 * signed in is the proof, and Google gave it a moment ago. Asking them for a
 * password they were never given is asking a question with no answer.
 */
export function PasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Checked here and not on the server: the server never receives this
    // field, because a mistyped repeat is a typing problem, not a rule.
    if (newPassword !== confirm) {
      setError("שתי הסיסמאות אינן זהות");
      return;
    }

    startTransition(async () => {
      const result = await setPasswordAction({
        currentPassword: hasPassword ? currentPassword : undefined,
        newPassword,
      });
      if (!result.success) {
        setError(result.error ?? "שגיאה בשמירה");
        return;
      }
      toast.success(hasPassword ? "הסיסמה עודכנה" : "הסיסמה נקבעה");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      router.refresh();
    });
  }

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (v: string) => void,
    autoComplete: string,
  ) => (
    <div>
      <Label htmlFor={id} className="mb-1.5">
        {label}
      </Label>
      <div dir="ltr" className="relative">
        <Input
          id={id}
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
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
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
      {!hasPassword && (
        <p className="border-border bg-muted/50 text-muted-foreground rounded-lg border p-3 text-sm leading-relaxed">
          החשבון הזה נפתח דרך Google ואין לו סיסמה. אחרי שתקבעו אחת, אפשר יהיה להתחבר גם עם
          המייל או הטלפון והסיסמה — וגם להמשיך עם Google, כרגיל.
        </p>
      )}

      {hasPassword &&
        field("currentPassword", "הסיסמה הנוכחית", currentPassword, setCurrentPassword, "current-password")}
      {field("newPassword", "סיסמה חדשה", newPassword, setNewPassword, "new-password")}
      {field("confirmPassword", "אישור הסיסמה החדשה", confirm, setConfirm, "new-password")}

      {error && (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-3 py-2 text-sm"
        >
          {error}
        </p>
      )}

      <Button type="submit" variant="brand" size="lg" disabled={isPending} className="h-11 font-bold">
        {isPending ? "שומר…" : hasPassword ? "עדכון הסיסמה" : "קביעת סיסמה"}
      </Button>
    </form>
  );
}
