import Link from "next/link";

export function BrandStrip({ brands }: { brands: { name: string; slug: string }[] }) {
  if (brands.length === 0) return null;

  return (
    <section className="border-border bg-secondary/40 border-y py-8">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="mb-5 text-center text-lg font-bold sm:text-xl">המותגים המובילים אצלנו</h2>
        <div className="flex flex-wrap justify-center gap-3">
          {brands.map((b) => (
            <Link
              key={b.slug}
              href={`/brand/${b.slug}`}
              className="border-border bg-card hover:border-brand/40 hover:text-brand rounded-full border px-5 py-2 text-sm font-semibold transition-colors"
            >
              {b.name}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
