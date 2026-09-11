import Image from "next/image";
import Link from "next/link";

type FeaturedBrand = { name: string; slug: string; logoUrl: string | null };

export function BrandStrip({ brands }: { brands: FeaturedBrand[] }) {
  if (brands.length === 0) return null;
  // Twelve is what a 1280px row holds without shrinking the marks. The
  // list arrives logos-first, so the cut keeps the recognisable names.
  const shown = brands.slice(0, 12);

  return (
    // Directly under the department row, on the page's own white, as a
    // quiet band: recognisable manufacturers on the first scroll are the
    // fastest "this is a real appliance shop" a page can give. It used to
    // scroll on its own; a strip that moves is a strip nobody reads, so
    // it holds still and wraps.
    <section className="border-border border-b py-5">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="text-muted-foreground mb-3 text-center text-xs font-semibold tracking-wide">
          המותגים שאנחנו מוכרים, באחריות יבואן רשמי
        </h2>
        <ul className="flex items-center gap-x-8 gap-y-3 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:justify-center [&::-webkit-scrollbar]:hidden">
          {shown.map((b) => (
            <li key={b.slug} className="shrink-0">
              <Link
                href={`/brand/${b.slug}`}
                className="flex h-10 w-28 items-center justify-center opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
                title={b.name}
              >
                {b.logoUrl ? (
                  <Image src={b.logoUrl} alt={b.name} width={112} height={40} className="h-auto max-h-9 w-auto max-w-28 object-contain" />
                ) : (
                  /* No logo file, so the name in our own type — never an
                     approximation of the manufacturer's mark. A drawn
                     lookalike of a trademark is worse than plain text, and
                     plain text is what a shop that has not been given the
                     asset honestly has. */
                  <span className="text-foreground/80 max-w-28 truncate text-center text-sm font-bold tracking-tight">
                    {b.name}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
