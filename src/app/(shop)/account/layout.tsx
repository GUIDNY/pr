import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AccountDeleteLink, AccountNav, type AccountNavItem } from "@/components/account/account-nav";
import { LogoutButton } from "@/components/layout/logout-button";

const NAV: AccountNavItem[] = [
  { href: "/account", label: "סקירה כללית", icon: "overview" },
  { href: "/account/orders", label: "ההזמנות שלי", icon: "orders" },
  { href: "/account/club", label: "מועדון הקניון", icon: "club" },
  { href: "/account/addresses", label: "כתובות", icon: "addresses" },
  { href: "/account/favorites", label: "מועדפים", icon: "favorites" },
  { href: "/account/password", label: "סיסמה", icon: "password" },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  // proxy.ts already turns a cookie-less request away, and does it knowing
  // which account page was asked for. This is the check that matters though:
  // a cookie can be present and still not be a session — expired, forged, or
  // belonging to a user who no longer exists — and only getSession can tell.
  if (!session) redirect("/login?redirect=/account");
  // the mall's club, for everyone since the mall opened to the public (10 November)
  const nav = NAV;
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { email: true } });
  const initial = session.name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="bg-muted/30 min-h-[70vh]">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_1fr] lg:gap-8">
          <aside className="h-fit lg:sticky lg:top-24">
            <div className="bg-card hidden rounded-2xl border p-4 shadow-[0_1px_2px_rgb(0_0_0/0.04)] lg:block">
              <div className="mb-4 flex items-center gap-3 border-b pb-4">
                <span className="from-brand to-brand-hover text-brand-foreground grid size-12 shrink-0 place-items-center rounded-full bg-gradient-to-br text-lg font-black">
                  {initial}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-bold">{session.name}</p>
                  {user?.email && (
                    <p dir="ltr" className="text-muted-foreground truncate text-end text-xs">
                      {user.email}
                    </p>
                  )}
                </div>
              </div>
              <AccountNav items={nav} />
              <div className="mt-3 border-t pt-3">
                <AccountDeleteLink />
                <LogoutButton className="hover:bg-muted text-destructive flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium disabled:opacity-60" />
              </div>
            </div>
            {/* phone: the same menu as tabs; account deletion and sign-out sit at the foot of the page */}
            <div className="lg:hidden">
              <AccountNav items={nav} />
            </div>
          </aside>
          <div className="min-w-0">
            {children}
            <div className="mt-8 flex flex-col gap-1 border-t pt-4 lg:hidden">
              <AccountDeleteLink />
              <LogoutButton className="hover:bg-muted text-destructive flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium disabled:opacity-60" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
