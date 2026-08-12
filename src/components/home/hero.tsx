import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck, Truck, Headset } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HERO_COLLAGE_IMAGES } from "@/lib/marketing-images";

export function Hero({
  title,
  subtitle,
  ctaLabel,
  ctaHref,
}: {
  title: string;
  subtitle: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 15% 20%, oklch(0.35 0.09 20.7 / 0.55), transparent), radial-gradient(ellipse 50% 60% at 90% 90%, oklch(0.3 0.02 20.7 / 0.6), transparent)",
        }}
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 py-14 sm:py-20 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <h1 className="max-w-2xl text-3xl leading-tight font-black text-balance sm:text-5xl">
            {title}
          </h1>
          <p className="text-primary-foreground/70 max-w-xl text-base sm:text-lg">{subtitle}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="brand" size="lg" asChild className="h-12 px-6 text-base">
              <Link href={ctaHref}>
                {ctaLabel}
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <Button
              variant="outline"
              size="lg"
              asChild
              className="border-primary-foreground/20 text-primary-foreground hover:bg-primary-foreground/10 h-12 bg-transparent px-6 text-base"
            >
              <Link href="/finder">עזרו לי לבחור</Link>
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <span className="flex items-center gap-2">
              <Truck className="text-brand size-4" /> משלוח עד הבית
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck className="text-brand size-4" /> אחריות יבואן רשמי
            </span>
            <span className="flex items-center gap-2">
              <Headset className="text-brand size-4" /> שירות לקוחות זמין
            </span>
          </div>
        </div>

        <div className="hidden h-72 grid-cols-2 gap-3 sm:h-96 lg:grid xl:h-[26rem]">
          <div className="relative row-span-2 overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10">
            <Image
              src={HERO_COLLAGE_IMAGES.large}
              alt=""
              fill
              sizes="(min-width: 1024px) 22vw, 0px"
              className="object-cover"
              priority
            />
          </div>
          <div className="relative overflow-hidden rounded-2xl shadow-xl ring-1 ring-white/10">
            <Image
              src={HERO_COLLAGE_IMAGES.topSmall}
              alt=""
              fill
              sizes="(min-width: 1024px) 22vw, 0px"
              className="object-cover"
            />
          </div>
          <div className="relative overflow-hidden rounded-2xl shadow-xl ring-1 ring-white/10">
            <Image
              src={HERO_COLLAGE_IMAGES.bottomSmall}
              alt=""
              fill
              sizes="(min-width: 1024px) 22vw, 0px"
              className="object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
