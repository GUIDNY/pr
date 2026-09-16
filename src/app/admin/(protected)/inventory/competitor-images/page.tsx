import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import { getCompetitorImageProducts } from "@/lib/queries/admin-inventory";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { CompetitorImageList } from "@/components/admin/competitor-image-list";

export const metadata = { title: "תמונות ממתחרים | Buy Today Admin" };

export default async function CompetitorImagesPage() {
  // The tab is hidden from everyone else, but a hidden link is not a lock.
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) redirect("/admin/inventory");

  const rows = await getCompetitorImageProducts();
  return (
    <div>
      <InventoryTabs owner />
      <CompetitorImageList rows={rows} />
    </div>
  );
}
