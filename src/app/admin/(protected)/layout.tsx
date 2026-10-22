import { redirect } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Package,
  ShoppingBag,
  ShoppingCart,
  Tag as TagIcon,
  Truck,
  ExternalLink,
  Boxes,
  MessageCircle,
  Sparkles,
  AlertTriangle,
  CreditCard,
  GalleryHorizontal,
  TicketPercent,
  Coins,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { LogoutButton } from "@/components/layout/logout-button";
import { isPelecardSandbox } from "@/lib/pelecard/config";
import { isBackOffice, canManageCatalog, isSiteAdmin } from "@/lib/permissions";
import { canSeePriceList } from "@/lib/price-list-access";
import { db } from "@/lib/db";
import { AdminMenuSheet, AdminTabBar } from "@/components/admin/admin-mobile-shell";

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
  /* Under orders, because that is where the two people who were given it
     already are. `priceList: true` is its own flag and not `catalog`: the
     catalog links are a role's business and this one is a named list of
     addresses — see lib/price-list-access.ts. */
  { href: "/admin/prices", label: "מחירים ועלויות", icon: Coins, priceList: true },
  { href: "/admin/abandoned", label: "עגלות נטושות", icon: ShoppingCart, catalog: true },
  { href: "/admin/complaints", label: "תלונות", icon: AlertTriangle, catalog: true },
  { href: "/admin/products", label: "מוצרים", icon: Package, catalog: true },
  { href: "/admin/inventory", label: "בקרת מלאי", icon: Boxes, catalog: true },
  /* Two different things were both called "מבצעים" and only one of them was
     listed, which is how "where do I put a product on sale" became
     unanswerable from this sidebar. /admin/deals is the discount on a
     product — what the homepage rail and /deals show. /admin/promotions is
     coupon codes and cart-level discounts. Same word, unrelated jobs, so
     neither label is that word on its own any more. */
  { href: "/admin/deals", label: "מוצרים במבצע", icon: TagIcon, catalog: true },
  { href: "/admin/promotions", label: "קופונים והנחות עגלה", icon: TicketPercent, catalog: true },
  { href: "/admin/suppliers", label: "ספקים", icon: Truck, catalog: true },
  { href: "/admin/chatbot", label: "אלפרד - צ'אט בוט", icon: MessageCircle, catalog: true },
  { href: "/admin/homepage-alfred", label: "אלפרד ממליץ - דף הבית", icon: Sparkles, catalog: true },
  // The owner's alone — what the shop advertises about itself. The page
  // checks the role itself; this only decides who sees the link.
  { href: "/admin/banners", label: "באנרים - דף הבית", icon: GalleryHorizontal, catalog: true, ownerOnly: true },
];

/* The phone's tab bar: the four screens a thumb reaches for, when the role
   has them — the dashboard, the orders, the products, the stock — and for a
   role that has not (a seller sees orders and little else) the first of
   what it does have. */
const TAB_BAR_PREFERRED = ["/admin", "/admin/orders", "/admin/products", "/admin/inventory"];
function tabBar(nav: { href: string; label: string; exact?: boolean }[]) {
  const preferred = TAB_BAR_PREFERRED.map((href) => nav.find((n) => n.href === href)).filter((n) => n !== undefined);
  const picked = preferred.length >= 3 ? preferred : nav.slice(0, 4);
  return picked.map(({ href, label, exact }) => ({ href, label, exact }));
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || !isBackOffice(session.role)) {
    redirect("/admin/login");
  }

  /* The payments page used to be listed only against the test gateway, because
     outside it the page 404'd and a dead link in the sidebar is how someone
     concludes the back office is broken. It no longer 404s: it answers "why is
     checkout showing the demo form", which is a question that only ever gets
     asked on the live site. So it is listed everywhere, and the label says what
     it is rather than which gateway it happens to be pointed at. */
  const full = canManageCatalog(session.role);
  const owner = isSiteAdmin(session.role);
  const viewer = await db.user.findUnique({ where: { id: session.sub }, select: { email: true } });
  const prices = canSeePriceList(viewer?.email, session.role);
  const visible = NAV.filter(
    (item) =>
      (full || !item.catalog) &&
      (owner || !("ownerOnly" in item && item.ownerOnly)) &&
      (prices || !("priceList" in item && item.priceList)),
  );
  const nav = full
    ? [
        ...visible,
        {
          href: "/admin/pelecard-test",
          label: isPelecardSandbox() ? "סליקה (סנדבוקס)" : "סליקה",
          icon: CreditCard,
        },
      ]
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
<LogoutButton className="hover:bg-primary-foreground/10 flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium disabled:opacity-60" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* The phone's chrome: the drawer with every screen, the mark, and
            the way back to the shop — in the same tab, because a phone's
            new tab is the one nobody finds again. The sidebar's links are
            rendered once more here, by the same list, so what a role sees
            is decided in one place. */}
        <header className="bg-background sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2 lg:hidden">
          <AdminMenuSheet>
            <nav className="flex flex-col gap-1 p-3">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="hover:bg-muted flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium"
                >
                  <item.icon className="text-brand size-5" />
                  {item.label}
                </Link>
              ))}
            </nav>
            <div className="border-t p-3">
              <Link href="/" className="hover:bg-muted flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium">
                <ExternalLink className="text-brand size-5" /> חזרה לאתר
              </Link>
              <LogoutButton className="hover:bg-muted flex w-full items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium disabled:opacity-60" />
            </div>
          </AdminMenuSheet>
          <span className="flex flex-1 items-center gap-1.5 text-base leading-none font-black">
            <span className="text-brand">Buy</span>
            <span>Today</span>
            <span className="bg-muted text-muted-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
              {full ? "Admin" : "מכירות"}
            </span>
          </span>
          <Link
            href="/"
            className="bg-brand/10 text-brand hover:bg-brand/20 flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-bold whitespace-nowrap"
          >
            <ExternalLink className="size-3.5" /> לאתר
          </Link>
        </header>
        <main id="main-content" className="flex-1 p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>
        <AdminTabBar tabs={tabBar(nav)} />
      </div>
    </div>
  );
}
