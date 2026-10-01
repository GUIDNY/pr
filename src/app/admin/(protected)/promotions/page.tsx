import { PromotionsManager } from "@/components/admin/promotions-manager";
import { getAdminPromotions, getPromotionOptions } from "@/lib/queries/admin-promotions";

export const metadata = { title: "קופונים | Buy Today Admin" };
export const dynamic = "force-dynamic";

export default async function AdminPromotionsPage() {
  const [{ promotions, personalCount }, options] = await Promise.all([getAdminPromotions(), getPromotionOptions()]);
  return <PromotionsManager initial={promotions} personalCount={personalCount} options={options} />;
}
