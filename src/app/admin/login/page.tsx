"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/actions/auth";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      if (result.role !== "ADMIN" && result.role !== "STAFF") {
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
          <h1 className="text-xl font-bold">
            <span className="text-brand">P</span>REC Admin
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">כניסה לממשק הניהול</p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <div>
            <Label htmlFor="email" className="mb-1.5">אימייל</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
          </div>
          <div>
            <Label htmlFor="password" className="mb-1.5">סיסמה</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {error && <p className="text-destructive text-sm">{error}</p>}
          <Button type="submit" variant="brand" size="lg" disabled={isPending} className="mt-2">
            {isPending ? "מתחבר..." : "כניסה"}
          </Button>
        </form>

        <div className="bg-muted mt-6 rounded-lg p-3 text-xs">
          <p className="mb-1 font-semibold">גישת הדגמה:</p>
          <p>admin@prec.co.il / admin123</p>
          <p>staff@prec.co.il / staff123</p>
        </div>
      </div>
    </div>
  );
}
