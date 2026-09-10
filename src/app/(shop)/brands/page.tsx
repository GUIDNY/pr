import Link from "next/link";
import Image from "next/image";
import { getBrandsWithProducts } from "@/lib/queries/content";

export const metadata = { title: "מותגים" };

export default async function BrandsPage() {
  const brands = await getBrandsWithProducts();

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-1 text-2xl font-bold">כל המותגים</h1>
      <p className="text-muted-foreground mb-6 text-sm">{brands.length} מותגים עם מוצרים במלאי</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {brands.map((b) => (
          <Link
            key={b.slug}
            href={`/brand/${b.slug}`}
            className="border-border bg-card hover:border-brand/40 hover:shadow-md flex flex-col gap-2 rounded-xl border p-5 transition-all"
          >
            {/* The logo where there is a real file, the name where there is
                not — never a drawn stand-in for a manufacturer's mark. The
                fixed height keeps the cards on a grid either way. */}
            <div className="flex h-10 items-center">
              {b.logoUrl ? (
                <Image
                  src={b.logoUrl}
                  alt={b.name}
                  width={110}
                  height={40}
                  className="h-auto max-h-10 w-auto max-w-28 object-contain"
                />
              ) : (
                <span className="text-lg font-bold">{b.name}</span>
              )}
            </div>
            {b.logoUrl && <span className="text-lg font-bold">{b.name}</span>}
            <span className="text-muted-foreground text-xs">{b.productCount} מוצרים</span>
            {b.description && <span className="text-muted-foreground line-clamp-2 text-sm">{b.description}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
