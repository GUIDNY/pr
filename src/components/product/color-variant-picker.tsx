import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import type { ColorVariant } from "@/lib/queries/products";

/**
 * Choosing a finish, on the product page.
 *
 * Links, not state. Each colour is a separate product with its own slug,
 * SKU, price, stock and photographs, so picking one is a navigation to that
 * product — which keeps every colour independently indexable, shareable and
 * addable to a basket, and means nothing on this page has to hold a
 * "selected variant" that the price, the gallery, the stock badge and the
 * add-to-cart button would each have to be kept in step with.
 *
 * The price is printed under a swatch only when it differs from the one
 * being viewed. Two finishes of an appliance usually cost the same, and a
 * row of identical prices is noise that hides the one time it matters —
 * the Elica hood is ₪2,700 in stainless and ₪2,800 in black, and that is
 * exactly the fact a shopper needs before clicking rather than after.
 */
export function ColorVariantPicker({ variants }: { variants: ColorVariant[] }) {
  if (variants.length < 2) return null;

  const current = variants.find((v) => v.isCurrent);

  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">צבע</span>
        {current && <span className="text-muted-foreground text-sm">{current.color}</span>}
      </div>

      <ul className="flex flex-wrap gap-2">
        {variants.map((v) => {
          const priceDiffers = current !== undefined && v.price !== current.price;
          /* No photograph of this finish in particular — see
             getColorVariants, which drops a picture that is simply the
             current product's repeated. The colour is offered by name, in
             a chip sized to sit level with the photo tiles beside it. An
             empty grey square would read as a picture that failed to load
             and invite a reload; a name reads as what it is. */
          const tile = v.imageUrl ? (
            <>
              <span className="relative block size-12 overflow-hidden rounded-lg bg-white">
                <Image
                  src={v.imageUrl}
                  // The colour name below the tile already says what this
                  // is, and these URLs are largely hotlinks that can stop
                  // answering — alt text painted across a 48px swatch is
                  // worse than an empty one.
                  alt=""
                  fill
                  className="object-contain p-1"
                  sizes="48px"
                  referrerPolicy="no-referrer"
                />
              </span>
              <span className="block max-w-16 truncate text-center text-[11px] leading-tight">{v.color}</span>
              {priceDiffers && (
                <span className="text-muted-foreground block text-center text-[11px] leading-tight">
                  {formatPrice(v.price)}
                </span>
              )}
            </>
          ) : (
            <span className="flex h-12 min-w-16 flex-col items-center justify-center px-2">
              <span className="max-w-20 truncate text-center text-xs font-medium leading-tight">{v.color}</span>
              {priceDiffers && (
                <span className="text-muted-foreground text-[11px] leading-tight">{formatPrice(v.price)}</span>
              )}
            </span>
          );

          return (
            <li key={v.slug}>
              {v.isCurrent ? (
                /* Not a link to the page it is already on. aria-current is
                   what tells a screen reader which swatch is selected —
                   the ring only says it to people who can see it. */
                <span
                  aria-current="true"
                  className="border-brand bg-brand/5 flex flex-col items-center gap-1 rounded-xl border-2 p-1.5"
                >
                  {tile}
                </span>
              ) : (
                <Link
                  href={`/product/${v.slug}`}
                  aria-label={`${v.color} — ${formatPrice(v.price)}`}
                  className="border-border hover:border-brand/60 flex flex-col items-center gap-1 rounded-xl border-2 p-1.5 transition-colors"
                >
                  {tile}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
