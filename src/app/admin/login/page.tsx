"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/actions/auth";
import { isBackOffice } from "@/lib/permissions";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await loginAction({ email, password });
      if (!result.success) {
        setError(result.error ?? "שגיאה בהתחברות");
        return;
      }
      if (!isBackOffice(result.role)) {
        setError("אין לך הרשאת גישה לממשק הניהול");
        return;
      }
      toast.success("התחברת בהצלחה");
      router.push("/admin");
      router.refresh();
    });
  }

  return (
    <div dir="rtl" className="bg-primary flex min-h-svh items-center justify-center px-4">
      <div className="bg-background w-full max-w-sm rounded-2xl p-8 shadow-xl">
        <div className="mb-6 text-center">
          <span className="bg-brand/10 text-brand mx-auto mb-3 flex size-12 items-center justify-center rounded-full">
            <ShieldCheck className="size-5" />
          </span>
          <h1 className="flex flex-col items-center text-xl leading-none font-bold">
            <span className="text-brand">Buy</span>
            <span>Today Admin</span>
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">כניסה לממשק הניהול</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="email" className="mb-1.5">אימייל</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              className="h-11 text-start"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="password" className="mb-1.5">סיסמה</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                dir="ltr"
                className="h-11 pe-11 text-start"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "הסתרת הסיסמה" : "הצגת הסיסמה"}
                className="text-muted-foreground hover:text-foreground absolute end-0 top-0 flex h-11 w-11 items-center justify-center"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" variant="brand" size="lg" disabled={isPending} className="mt-2 h-12 text-base font-bold">
            {isPending ? "מתחבר…" : "כניסה"}
          </Button>
        </form>

        {/* A block here used to print admin@prec.co.il / admin123 and the
            staff pair beside it. On a page anybody can open, that is not a
            demo aid — it is the back office's password, published. */}
      </div>
    </div>
  );
}
