import { accountHasPassword } from "@/actions/auth";
import { PasswordForm } from "@/components/auth/password-form";

export const metadata = { title: "סיסמה" };

export default async function PasswordPage() {
  const hasPassword = await accountHasPassword();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold">{hasPassword ? "שינוי סיסמה" : "קביעת סיסמה"}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {hasPassword
            ? "כדי להחליף סיסמה צריך להזין את הנוכחית."
            : "אפשר להוסיף סיסמה לחשבון ולהתחבר גם בלי Google."}
        </p>
      </div>
      <PasswordForm hasPassword={hasPassword} />
    </div>
  );
}
