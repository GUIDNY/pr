import Image from "next/image";
import Link from "next/link";
import { ArrowDown } from "lucide-react";
import { SinglesDayCountdown } from "@/components/campaign/countdown";

const ils = (n: number) => n.toLocaleString("he-IL");

export type Spotlight = {
  slug: string;
  brand: string;
  name: string;
  imageUrl: string | null;
  was: number;
  now: number;
  pct: number;
};

export type GroupLink = { id: string; label: string; count: number };

/**
 * The hero, drawn like a shop-window poster rather than a banner, in the
 * festival's colours — the red and gold of a hongbao, the red envelope,
 * with its gold edge (see singles-day-home-banner.tsx for why these and
 * not a retailer's). 11.11 is four ones standing side by side — singles — so
 * the numerals are the illustration, outlined so they sit behind the type
 * instead of competing with it. The biggest deal hangs on a paper price tag,
 * which is the one object every shopper already knows how to read.
 */
export function SinglesDayHero({
  spotlight,
  count,
  maxDiscount,
  groups,
  initialNow,
}: {
  spotlight: Spotlight | null;
  count: number;
  maxDiscount: number;
  groups: GroupLink[];
  initialNow: number;
}) {
  return (
    <section className="relative overflow-hidden bg-[radial-gradient(120%_120%_at_90%_0%,#ff2a3d_0%,#e3001b_40%,#a8000f_100%)] text-white">
      {/* a darker pool low on the far side, so the red has depth without an image */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 [background:radial-gradient(50%_60%_at_12%_95%,rgb(80_0_8/0.45)_0%,transparent_70%)]"
      />
      <div
        aria-hidden
        dir="ltr"
        className="pointer-events-none absolute bottom-0 left-0 translate-y-[22%] select-none whitespace-nowrap text-[46vw] font-black leading-[0.8] tracking-[-0.05em] text-transparent [-webkit-text-stroke:1.5px_rgb(255_210_90/0.22)] lg:-left-8 lg:text-[24rem]"
      >
        11.11
      </div>

      <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-10 sm:py-14 pb-20 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-6 lg:py-16">
        {/* ── words ── */}
        <div>
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
            <span className="rounded-sm bg-[#ffd25a] px-2 py-0.5 font-mono tracking-[0.15em] text-[#7d000c]">11.11.26</span>
            <span lang="zh" className="text-[#ffd25a]">光棍节</span>
            <span className="text-white/80">
              יום אחד · <span dir="ltr">00:00–23:59</span> · עד גמר המלאי
            </span>
          </div>

          <h1 className="text-[3.4rem] font-black leading-[0.9] tracking-[-0.03em] sm:text-7xl lg:text-[6.5rem]">
            יום הרווקים
            <br />
            <span className="text-[#ffd25a]">הסיני.</span>
          </h1>
          <p className="mt-5 max-w-md text-xl font-bold leading-snug sm:text-2xl">
            לא צריך זוג בשביל לחסוך.
          </p>
          <p className="mt-2 max-w-md text-base leading-relaxed text-white/85">
            {count} מוצרים למטבח ולבית שבחרנו אחד-אחד, עד {maxDiscount}% מתחת למחיר הרגיל שלנו. מחיר ליום אחד, וכשהמלאי נגמר — נגמר.
          </p>

          <div className="mt-7">
            <SinglesDayCountdown tone="red" initialNow={initialNow} />
          </div>

          <nav aria-label="קטגוריות במבצע" className="mt-8 flex flex-wrap gap-2">
            {groups.map((g) => (
              <a
                key={g.id}
                href={`#${g.id}`}
                className="group inline-flex items-center gap-2 rounded-full border border-[#ffd25a]/40 bg-white/10 py-1.5 ps-4 pe-1.5 text-sm font-semibold backdrop-blur transition hover:border-[#ffd25a] hover:bg-white/20"
              >
                {g.label}
                <span className="rounded-full bg-[#ffd25a] px-2 py-0.5 text-xs font-bold tabular-nums text-[#7d000c]">{g.count}</span>
              </a>
            ))}
            <a href="#deals" className="inline-flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold text-white/80 hover:text-white">
              <ArrowDown className="size-4" /> לכל המבצעים
            </a>
          </nav>
        </div>

        {/* ── the tag ── */}
        {spotlight && <PriceTagSpotlight s={spotlight} />}
      </div>
    </section>
  );
}

function PriceTagSpotlight({ s }: { s: Spotlight }) {
  return (
    <Link href={`/product/${s.slug}`} className="group relative mx-auto block w-full max-w-md lg:max-w-none">
      {/* the product, on a white plinth */}
      <div className="relative aspect-[4/3.4] overflow-hidden rounded-[2rem] bg-white shadow-[0_30px_60px_-24px_rgb(60_0_5/0.6)] ring-4 ring-[#ffd25a]/50">
        {s.imageUrl && (
          <Image
            src={s.imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 40vw, 90vw"
            className="object-contain p-8 transition-transform duration-500 group-hover:scale-[1.03] sm:p-10"
            referrerPolicy="no-referrer"
            priority
          />
        )}
        <span className="absolute top-5 start-6 text-sm font-bold text-neutral-400">
          המבצע הגדול
        </span>
      </div>

      {/* the tag: string, eyelet, card, stamp */}
      <div className="absolute -bottom-8 end-2 w-52 origin-top-left -rotate-[5deg] transition-transform duration-300 group-hover:-rotate-[3deg] sm:end-6 sm:w-72">
        <svg aria-hidden viewBox="0 0 100 60" className="absolute -top-14 start-10 h-16 w-24 text-[#ffd25a]">
          <path d="M8 58 C 30 20, 60 40, 96 2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <div className="relative rounded-xl bg-[#fffdf8] p-5 pt-7 shadow-[0_18px_30px_-12px_rgb(60_0_5/0.6),0_0_0_1px_rgb(0_0_0/0.06)] text-neutral-950">
          <span aria-hidden className="absolute top-3 start-1/2 size-3 -translate-x-1/2 rounded-full bg-[#c4001a] shadow-[inset_0_1px_2px_rgb(0_0_0/0.35)]" />
          <div className="rounded-md border border-dashed border-neutral-300 p-3">
            <div className="text-xs font-bold tracking-wide text-neutral-500">{s.brand}</div>
            <div className="mt-0.5 line-clamp-2 text-sm font-semibold leading-tight">{s.name}</div>
            <div className="mt-3 text-sm tabular-nums text-neutral-400 line-through decoration-[#e3001b] decoration-2">
              {ils(s.was)} ₪
            </div>
            <div className="flex items-baseline gap-1 leading-none">
              <span className="text-4xl font-black tabular-nums tracking-tight sm:text-5xl">{ils(s.now)}</span>
              <span className="text-xl font-black">₪</span>
            </div>
            <div className="mt-2 text-xs font-bold text-[#c4001a]">חוסכים {ils(s.was - s.now)} ₪</div>
          </div>
          <div className="absolute -top-5 -end-5 flex size-[4.5rem] rotate-12 flex-col items-center justify-center rounded-full bg-[#e3001b] text-[#ffd25a] shadow-lg ring-4 ring-[#ffd25a]">
            <span className="text-2xl font-black leading-none tabular-nums">{s.pct}%</span>
            <span className="text-[10px] font-bold">הנחה</span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* A ticker, the way a shop window runs its offers. Only things that are
   true of every product on the page. */
export function SinglesDayTicker({ lines }: { lines: string[] }) {
  const row = (
    <div className="flex shrink-0 items-center">
      {lines.map((l) => (
        <span key={l} className="flex items-center gap-6 px-6 text-sm font-semibold whitespace-nowrap">
          {l}
          <span aria-hidden className="text-[#ffd25a]">✦</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden border-y border-[#ffd25a]/40 bg-[#7d000c] py-3 text-white" aria-label={lines.join(" · ")}>
      <div className="sd-marquee flex w-max" aria-hidden>
        {row}
        {row}
        {row}
        {row}
      </div>
    </div>
  );
}

export function SinglesDaySectionHeading({ index, label, count, id }: { index: number; label: string; count: number; id: string }) {
  return (
    <div id={id} className="mb-5 flex scroll-mt-28 items-end gap-4 border-b-2 border-[#e3001b] pb-3">
      <span className="font-mono text-sm font-semibold text-[#e3001b] tabular-nums">{String(index).padStart(2, "0")}</span>
      <h2 className="text-2xl font-black tracking-tight sm:text-3xl">{label}</h2>
      <span className="ms-auto text-sm text-neutral-500">{count} מוצרים</span>
    </div>
  );
}
