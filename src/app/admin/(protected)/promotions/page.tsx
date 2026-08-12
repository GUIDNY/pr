import { db } from "@/lib/db";
import { PromotionsManager } from "@/components/admin/promotions-manager";

export const metadata = { title: "מבצעים | PREC Admin" };

export default async function AdminPromotionsPage() {
  const promotions = await db.promotion.findMany({ orderBy: { createdAt: "desc" } });
  return <PromotionsManager initial={promotions} />;
}
