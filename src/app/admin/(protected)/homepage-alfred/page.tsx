import { db } from "@/lib/db";
import { AlfredWidgetManager } from "@/components/admin/alfred-widget-manager";

export const metadata = { title: "אלפרד ממליץ - דף הבית | A&I Electronics Admin" };

export default async function AdminHomepageAlfredPage() {
  const [section, products] = await Promise.all([
    db.homepageSection.findUnique({ where: { key: "alfred-widget" } }),
    // Every real, in-stock deal is a valid candidate — not capped to the
    // homepage's own 8-item deals rail, so the admin can pick from the
    // full current list.
    db.product.findMany({
      where: { isPublished: true, stockQty: { gt: 0 }, compareAtPrice: { not: null } },
      select: {
        id: true,
        title: true,
        slug: true,
        price: true,
        compareAtPrice: true,
        images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);

  const selectedIds: string[] = section ? (JSON.parse(section.payload).productIds ?? []) : [];
  const pickerProducts = products.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    price: p.price,
    compareAtPrice: p.compareAtPrice,
    imageUrl: p.images[0]?.url ?? null,
  }));

  return <AlfredWidgetManager products={pickerProducts} initialSelectedIds={selectedIds} />;
}
