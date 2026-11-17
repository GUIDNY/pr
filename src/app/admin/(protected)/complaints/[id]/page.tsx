import { requireCatalogPage } from "@/lib/auth";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/* A complaint's own address, kept so that links already sent between staff
   (and the ones the owner alerts carry) still open it. The complaint now
   lives in the inbox's conversation pane, so this sends the visitor there
   with it selected. */
export default async function ComplaintPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCatalogPage();
  const { id } = await params;
  if (!/^[a-z0-9]{10,40}$/i.test(id)) notFound();
  redirect(`/admin/complaints?id=${id}&status=ALL`);
}
