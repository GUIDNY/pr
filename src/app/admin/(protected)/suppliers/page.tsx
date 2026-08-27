import { db } from "@/lib/db";
import { SuppliersManager } from "@/components/admin/suppliers-manager";

export const metadata = { title: "ספקים | A&I Electronics Admin" };

export default async function AdminSuppliersPage() {
  const suppliers = await db.supplier.findMany({
    include: { _count: { select: { products: true } } },
    orderBy: { name: "asc" },
  });
  return <SuppliersManager initial={suppliers} />;
}
