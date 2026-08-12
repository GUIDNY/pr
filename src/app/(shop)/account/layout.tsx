import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutDashboard, Package, MapPin, Heart, LogOut } from "lucide-react";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";

const NAV = [
  { href: "/account", label: "סקירה כללית", icon: LayoutDashboard },
  { href: "/account/orders", label: "ההזמנות שלי", icon: Package },
  { href: "/account/addresses", label: "כתובות", icon: MapPin },
  { href: "/account/favorites", label: "מועדפים", icon: Heart },
];

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
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
            <form action={logoutAction}>
              <button
                type="submit"
                className="hover:bg-muted text-destructive flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
              >
                <LogOut className="size-4" />
                התנתקות
              </button>
            </form>
          </nav>
        </aside>
        <div>{children}</div>
      </div>
    </div>
  );
}
