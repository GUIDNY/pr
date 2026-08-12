import Link from "next/link";
import { getActiveBrands } from "@/lib/queries/content";

export const metadata = { title: "מותגים" };

export default async function BrandsPage() {
  const brands = await getActiveBrands();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold">כל המותגים</h1>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/brand/${b.slug}`}
            className="border-border bg-card hover:border-brand/40 hover:shadow-md flex flex-col gap-2 rounded-xl border p-5 transition-all"
          >
            <span className="text-lg font-bold">{b.name}</span>
            {b.description && <span className="text-muted-foreground line-clamp-2 text-sm">{b.description}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
