import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Package, MapPin, Heart, KeyRound, Trash2 } from "lucide-react";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/layout/logout-button";

const NAV = [
  { href: "/account", label: "סקירה כללית", icon: LayoutDashboard },
  { href: "/account/orders", label: "ההזמנות שלי", icon: Package },
  { href: "/account/addresses", label: "כתובות", icon: MapPin },
  { href: "/account/favorites", label: "מועדפים", icon: Heart },
  { href: "/account/password", label: "סיסמה", icon: KeyRound },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // proxy.ts already turns a cookie-less request away, and does it knowing
  // which account page was asked for. This is the check that matters though:
  // a cookie can be present and still not be a session — expired, forged, or
  // belonging to a user who no longer exists — and only getSession can tell.
  if (!session) redirect("/login?redirect=/account");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[220px_1fr]">
        <aside className="border-border h-fit rounded-xl border p-3 lg:sticky lg:top-24">
          <div className="px-2 py-2">
            <p className="font-semibold">{session.name}</p>
          </div>
          <nav className="mt-2 flex flex-col gap-1">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:bg-muted flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
            {/* App Store guideline 5.1.1(v): an account that can be created
                in the app has to be deletable in the app, and a reviewer looks
                for it here rather than in a help page.

                With the English underneath, and this is the only place in the
                shop carrying a second language. App Review is not staffed to
                read Hebrew, and a reviewer scanning an RTL sidebar for a way
                to delete an account cannot tell which of five identical rows
                it is — which is a rejection for a feature that is right
                there. It is small and muted, so a customer reads the Hebrew
                and the label stays out of the way. */}
            <Link
              href="/account/delete"
              className="hover:bg-muted text-muted-foreground flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            >
              <Trash2 className="size-4 shrink-0" />
              <span className="flex flex-col items-start leading-tight">
                מחיקת החשבון
                <span dir="ltr" className="text-muted-foreground/70 text-[11px] font-normal">
                  Delete account
                </span>
              </span>
            </Link>
<LogoutButton className="hover:bg-muted text-destructive flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-60" />
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
