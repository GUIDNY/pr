import Image from "next/image";
import Link from "next/link";

type FeaturedBrand = { name: string; slug: string; logoUrl: string };

// Duplicated once so the CSS marquee can loop seamlessly: the animation
// scrolls exactly one copy's width, then jumps back unnoticed since the
// second copy is already in the same position.
export function BrandStrip({ brands }: { brands: FeaturedBrand[] }) {
  if (brands.length === 0) return null;
  const track = [...brands, ...brands];

  return (
    <section className="border-border bg-secondary/40 border-y py-10">
      <div className="mx-auto max-w-7xl px-4">
        <h2 className="mb-6 text-center text-lg font-bold sm:text-xl">המותגים המובילים אצלנו</h2>
      </div>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)]">
        <div className="animate-brand-marquee group-hover:[animation-play-state:paused] flex w-max items-center gap-16">
          {track.map((b, i) => (
            <Link
              key={`${b.slug}-${i}`}
              href={`/brand/${b.slug}`}
              className="flex h-16 w-32 shrink-0 items-center justify-center opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
              title={b.name}
              // The second copy exists only so the scroll can loop. A screen
              // reader has no scroll to loop and would simply read the whole
              // brand list twice, so it is hidden from the accessibility tree
              // and taken out of the tab order.
              aria-hidden={i >= brands.length}
              tabIndex={i >= brands.length ? -1 : undefined}
            >
              <Image src={b.logoUrl} alt={b.name} width={120} height={48} className="h-auto max-h-12 w-auto max-w-28 object-contain" />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
