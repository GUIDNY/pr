import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import { InventoryTabsNav } from "@/components/admin/inventory-tabs-nav";

/**
 * The inventory tab strip, which decides for itself who is looking.
 *
 * It used to take the answer as a prop, and that lasted exactly one commit:
 * two owner-only tabs were added, the prop was passed on the two new pages
 * that needed it, and the eight pages that already rendered `<InventoryTabs />`
 * kept their default of false — so the new tabs appeared on the pages you
 * reach only by already knowing the URL, and nowhere you would actually
 * find them. They were invisible from /admin/inventory, which is where
 * anyone looks.
 *
 * Reading the session here rather than accepting it means the ninth page
 * cannot forget. The rendering half stays a client component because the
 * active tab comes from usePathname; this half is a server component
 * wrapped around it, which is the only reason the split exists.
 */
export async function InventoryTabs() {
  const session = await getSession();
  return <InventoryTabsNav owner={isSiteAdmin(session?.role)} />;
}
