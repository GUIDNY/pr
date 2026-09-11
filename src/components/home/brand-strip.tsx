import Image from "next/image";
import Link from "next/link";

type FeaturedBrand = { name: string; slug: string; logoUrl: string | null };

// Duplicated once so the CSS marquee can loop seamlessly: the animation
// scrolls exactly one copy's width, then jumps back unnoticed since the
// second copy is already in the same position.
export function BrandStrip({ brands }: { brands: FeaturedBrand[] }) {
  if (brands.length === 0) return null;
  const track = [...brands, ...brands];

  return (
    // Directly under the hero, on the page's own white, as a quiet band:
    // recognisable manufacturers on the first scroll are the fastest
    // "this is a real appliance shop" a page can give, and a band that
    // shouts would undo that.
    <section className="border-border border-b py-6">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="text-muted-foreground mb-4 text-center text-xs font-semibold tracking-wide">
          המותגים שאנחנו מוכרים, באחריות יבואן רשמי
        </h2>
      </div>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="animate-brand-marquee group-hover:[animation-play-state:paused] flex w-max items-center gap-16">
          {track.map((b, i) => (
            <Link
              key={`${b.slug}-${i}`}
              href={`/brand/${b.slug}`}
              className="flex h-12 w-32 shrink-0 items-center justify-center opacity-60 grayscale transition hover:opacity-100 hover:grayscale-0"
              title={b.name}
            >
              {b.logoUrl ? (
                <Image src={b.logoUrl} alt={b.name} width={120} height={48} className="h-auto max-h-10 w-auto max-w-28 object-contain" />
              ) : (
                /* No logo file, so the name in our own type — never an
                   approximation of the manufacturer's mark. A drawn
                   lookalike of a trademark is worse than plain text, and
                   plain text is what a shop that has not been given the
                   asset honestly has. */
                <span className="text-foreground/80 max-w-28 text-center text-base font-bold tracking-tight">
                  {b.name}
                </span>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
