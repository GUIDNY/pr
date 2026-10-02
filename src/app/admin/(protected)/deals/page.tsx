import { requireAdmin } from "@/lib/auth";
import { getDealRows } from "@/lib/queries/admin-deals";
import { DealsManager } from "@/components/admin/deals-manager";

export const metadata = { title: "מוצרים במבצע | Buy Today Admin" };

export default async function AdminDealsPage() {
  // The nav hiding a link is presentation; the route checks for itself.
  await requireAdmin();
  const deals = await getDealRows();
  return <DealsManager initial={deals} />;
}
