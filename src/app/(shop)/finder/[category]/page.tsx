import { notFound } from "next/navigation";
import { FinderWizard } from "@/components/finder/finder-wizard";
import { FINDER_CATEGORIES } from "@/lib/finder-config";

export default async function FinderCategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const config = FINDER_CATEGORIES.find((c) => c.categorySlug === category);
  if (!config) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <FinderWizard config={config} />
    </div>
  );
}
