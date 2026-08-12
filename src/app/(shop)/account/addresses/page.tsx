import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddressManager } from "@/components/account/address-manager";

export const metadata = { title: "כתובות" };

export default async function AddressesPage() {
  const session = await getSession();
  if (!session) return null;

  const addresses = await db.address.findMany({
    where: { userId: session.sub },
    orderBy: [{ isDefault: "desc" }, { id: "asc" }],
  });

  return <AddressManager initialAddresses={addresses} />;
}
