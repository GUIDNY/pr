import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  Tag as TagIcon,
  Truck,
  LogOut,
  ExternalLink,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";

const NAV = [
  { href: "/admin", label: "לוח בקרה", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { href: "/admin/products", label: "מוצרים", icon: Package },
  { href: "/admin/promotions", label: "מבצעים", icon: TagIcon },
  { href: "/admin/suppliers", label: "ספקים", icon: Truck },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || (session.role !== "ADMIN" && session.role !== "STAFF")) {
    redirect("/admin/login");
  }

  return (
    <div dir="rtl" className="bg-secondary/30 flex min-h-svh">
      <aside className="bg-primary text-primary-foreground hidden w-64 shrink-0 flex-col lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="text-xl font-black">
            <span className="text-brand">P</span>REC
          </span>
          <span className="bg-primary-foreground/10 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
            Admin
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="hover:bg-primary-foreground/10 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
            >
              <item.icon className="size-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="border-primary-foreground/10 flex flex-col gap-1 border-t p-3">
          <Link
            href="/"
            target="_blank"
            className="hover:bg-primary-foreground/10 flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium"
          >
            <ExternalLink className="size-4" /> צפייה באתר
          </Link>
          <form action={logoutAction}>
            <button
              type="submit"
              className="hover:bg-primary-foreground/10 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium"
            >
              <LogOut className="size-4" /> התנתקות
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="bg-background flex items-center justify-between border-b px-4 py-3 lg:hidden">
          <span className="text-lg font-black">
            <span className="text-brand">P</span>REC Admin
          </span>
        </header>
        <main id="main-content" className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
