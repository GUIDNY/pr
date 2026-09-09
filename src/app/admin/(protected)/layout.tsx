import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ShoppingCart,
  Tag as TagIcon,
  Truck,
  LogOut,
  ExternalLink,
  Boxes,
  MessageCircle,
  Sparkles,
  AlertTriangle,
  CreditCard,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { logoutAction } from "@/actions/auth";
import { isPelecardSandbox } from "@/lib/pelecard/config";
import { isBackOffice, canManageCatalog } from "@/lib/permissions";

/**
 * `catalog: true` means the link belongs to running the shop rather than to
 * getting an order out, and a seller is not shown it.
 *
 * Hiding a link is presentation and nothing more — every one of these routes
 * checks the session itself, because a nav that omits a link is not a lock.
 * What the omission buys is that the back office a seller opens is the job
 * they were given, with nothing in it to wander into.
 */
const NAV = [
  { href: "/admin", label: "לוח בקרה", icon: LayoutDashboard, exact: true, catalog: true },
  { href: "/admin/orders", label: "הזמנות", icon: ShoppingBag },
  { href: "/admin/abandoned", label: "עגלות נטושות", icon: ShoppingCart, catalog: true },
  { href: "/admin/complaints", label: "תלונות", icon: AlertTriangle, catalog: true },
  { href: "/admin/products", label: "מוצרים", icon: Package, catalog: true },
  { href: "/admin/inventory", label: "בקרת מלאי", icon: Boxes, catalog: true },
  { href: "/admin/promotions", label: "מבצעים", icon: TagIcon, catalog: true },
  { href: "/admin/suppliers", label: "ספקים", icon: Truck, catalog: true },
  { href: "/admin/chatbot", label: "אלפרד - צ'אט בוט", icon: MessageCircle, catalog: true },
  { href: "/admin/homepage-alfred", label: "אלפרד ממליץ - דף הבית", icon: Sparkles, catalog: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !isBackOffice(session.role)) {
    redirect("/admin/login");
  }

  /* The sandbox console is listed only where it exists: outside the test
     gateway the page itself 404s, and a dead link in the sidebar is how
     someone concludes the back office is broken. */
  const full = canManageCatalog(session.role);
  const visible = full ? NAV : NAV.filter((item) => !item.catalog);
  const nav =
    full && isPelecardSandbox()
      ? [...visible, { href: "/admin/pelecard-test", label: "בדיקות סליקה (סנדבוקס)", icon: CreditCard }]
      : visible;

  return (
    <div dir="rtl" className="bg-secondary/30 flex min-h-svh">
      <aside className="bg-primary text-primary-foreground hidden w-64 shrink-0 flex-col lg:flex">
        <div className="flex items-center gap-2 px-5 py-5">
          <span className="flex flex-col items-center text-xl leading-none font-black">
            <span className="text-brand">Buy</span>
            <span>Today</span>
          </span>
          <span className="bg-primary-foreground/10 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
            {full ? "Admin" : "מכירות"}
          </span>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3">
          {nav.map((item) => (
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
          <span className="flex flex-col items-center text-lg leading-none font-black">
            <span className="text-brand">Buy</span>
            <span>Today Admin</span>
          </span>
        </header>
        <main id="main-content" className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
