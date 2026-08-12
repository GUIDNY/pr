"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { LogIn } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/actions/auth";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect") ?? "/account";
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
      toast.success("התחברת בהצלחה");
      router.push(result.role === "ADMIN" || result.role === "STAFF" ? "/admin" : redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <div className="mb-6 text-center">
        <span className="bg-brand/10 text-brand mx-auto mb-3 flex size-12 items-center justify-center rounded-full">
          <LogIn className="size-5" />
        </span>
        <h1 className="text-2xl font-bold">התחברות לחשבון</h1>
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
          {isPending ? "מתחבר..." : "התחברות"}
        </Button>
      </form>

      <p className="text-muted-foreground mt-6 text-center text-sm">
        אין לכם חשבון?{" "}
        <Link href="/register" className="text-brand font-medium hover:underline">
          הרשמה
        </Link>
      </p>

      <div className="bg-muted mt-8 rounded-lg p-3 text-xs">
        <p className="mb-1 font-semibold">גישת הדגמה:</p>
        <p>לקוח: eitan@example.com / demo1234</p>
        <p>מנהל: admin@prec.co.il / admin123</p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
