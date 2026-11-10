import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { MallAnchor } from "@/components/layout/mall-link";
import { cn } from "@/lib/utils";

/**
 * The 11.11 page's door into the 3D mall, where the day has a booth of its
 * own: lanterns, the deals on its counters and the countdown on its screen.
 * In the festival's red and gold like the rest of the page; the whole card is
 * the link (see MallPromo for why), and MallAnchor picks the address for the
 * web and the app.
 */
export function SinglesDayMallCard({ className }: { className?: string }) {
  return (
    <section aria-labelledby="sd-mall-title" className={cn("mx-auto max-w-7xl px-4", className)}>
      <MallAnchor
        medium="singles-day"
        className="group flex flex-col overflow-hidden rounded-2xl border-2 border-[#f2c14e] bg-gradient-to-l from-[#b00816] to-[#8a0610] text-white shadow-lg transition-transform active:scale-[0.995] sm:flex-row sm:items-center"
      >
        <Image
          src="https://play.buytoday.co.il/og.jpg"
          alt="הקניון התלת־ממדי של BuyToday"
          width={1200}
          height={630}
          sizes="(min-width: 1024px) 360px, (min-width: 640px) 34vw, 100vw"
          className="aspect-[1200/630] max-h-40 w-full object-cover object-[50%_30%] sm:order-last sm:m-3 sm:max-h-none sm:w-[34%] sm:rounded-xl lg:w-[28%]"
        />
        <span className="flex flex-1 flex-col justify-center gap-1.5 px-5 py-4 lg:px-7">
          <span className="text-xs font-bold text-[#f2c14e]">🏮 11.11 גם בקניון התלת־ממדי</span>
          <span id="sd-mall-title" className="text-lg leading-tight font-black sm:text-xl">
            בקרו בדוכן מבצעי יום הרווקים בקניון הווירטואלי
          </span>
          <span className="text-sm leading-snug text-white/85">
            פנסים, זיקוקים ודוכן מבצעים: מטיילים עם הדמות שלכם בין המחלקות ולוחצים כדי לקנות
          </span>
          <span className="mt-2 inline-flex h-10 w-fit items-center gap-2 rounded-lg bg-[#f2c14e] px-5 text-sm font-black text-[#8a0610] transition-colors group-hover:bg-[#ffd36b]">
            כניסה לקניון
            <ArrowLeft aria-hidden className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
        </span>
      </MallAnchor>
    </section>
  );
}
