import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type Brand = { name: string; slug: string; logoUrl: string | null; description: string | null };

// Compact brand strip — deliberately small (roughly 90-110px tall on
// desktop) so it introduces the brand without competing with the product
// itself for attention. Real logo when Brand.logoUrl is set; otherwise the
// brand's own name carries the same visual weight as bold wordmark
// typography, not a shrunken monogram.
export function BrandHighlight({ brand }: { brand: Brand }) {
  return (
    <div className="bg-primary relative overflow-hidden rounded-2xl">
      <div
        className="absolute inset-0 opacity-80"
        style={{ background: "radial-gradient(ellipse 70% 120% at 100% 0%, oklch(0.4 0.1 20.7 / 0.4), transparent)" }}
        aria-hidden
      />
      <div className="relative flex flex-col items-start gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-5">
        <div className="flex min-w-0 items-center gap-3">
          {brand.logoUrl && (
            <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-white p-1.5 sm:size-12">
              <Image src={brand.logoUrl} alt={brand.name} width={80} height={80} className="h-auto max-h-full w-auto max-w-full object-contain" />
            </div>
          )}
          <div className="min-w-0">
            <p
              className={cn(
                "text-primary-foreground truncate font-black tracking-tight",
                brand.logoUrl ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"
              )}
            >
              {brand.name}
            </p>
            {brand.description && <p className="text-primary-foreground/60 truncate text-xs">{brand.description}</p>}
          </div>
        </div>

        <Link
          href={`/brand/${brand.slug}`}
          // shrink-0 only from sm: up, where it sits beside the name in a
          // row — on mobile's stacked layout it's a lone full-width-capped
          // block, so it needs to be allowed to shrink/wrap instead of
          // forcing an unshrinkable width that can overflow a narrow
          // screen for a longer brand name.
          className="bg-brand text-brand-foreground flex max-w-full items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-transform hover:scale-105 sm:w-fit sm:shrink-0 sm:text-sm"
        >
          <span className="truncate">כל המוצרים של {brand.name}</span>
          <ArrowLeft className="size-3.5 shrink-0 rtl:rotate-180" />
        </Link>
      </div>
    </div>
  );
}
