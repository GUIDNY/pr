import Image from "next/image";
import { ArrowLeft } from "lucide-react";
import { MallAnchor } from "@/components/layout/mall-link";

/**
 * The homepage's door into the 3D mall.
 *
 * The footer has had a link for a while, and the footer is where nobody
 * looks for something to do. This is the same destination as a card near
 * the top of the page, on the web and in the app alike — MallAnchor picks
 * the address (play.buytoday.co.il in a new tab on the web, /mall in the same
 * view in the app, where a new tab would throw the customer out to Safari).
 *
 * A wide banner: the picture large on one side, a white block with one
 * heavy headline, one sentence and the button on the other, inside a plain
 * black frame. Flat throughout — the first version of this was a
 * navy-to-orange gradient with a perspective floor behind the text and read
 * as an advertisement dropped into the page; the second was a small white
 * card whose picture was a thumbnail and whose other half was empty. What
 * sells a 3D mall is seeing it, so the screenshot is the banner and the
 * words stand beside it. On a phone the picture runs the full width above
 * the text.
 *
 * The whole card is the link, not only the button in it: on a phone a thumb
 * lands anywhere on a card, and a card that only answers on one part of
 * itself reads as broken. The "button" is therefore a span that looks like
 * one — a real button inside a link is an interactive element inside
 * another, which assistive technology announces badly.
 *
 * The picture is the game's own share image, loaded from the game's host:
 * nothing new to keep in this repo, and it changes when the mall does.
 *
 * Server-rendered; only MallAnchor is a client component, so the homepage
 * stays as cacheable as it is.
 */
export function MallPromo() {
  return (
    <section aria-labelledby="mall-promo-title" className="mx-auto max-w-7xl px-4 py-4 lg:py-6">
      <MallAnchor
        medium="home"
        className="group bg-card text-foreground grid overflow-hidden border-2 border-black md:grid-cols-[1.4fr_1fr]"
      >
        {/* The top of the frame is where the mall is — the departments, the
            offer screens, the character — and the bottom half is floor, so
            the crop keeps the top. */}
        <span className="relative block aspect-[16/9] w-full overflow-hidden md:aspect-auto md:min-h-[20rem]">
          <Image
            src="https://play.buytoday.co.il/og.jpg"
            alt="הקניון התלת־ממדי של BuyToday: מחלקות, מסכי מבצעים ודמות שמטיילת ביניהם"
            fill
            sizes="(min-width: 1280px) 730px, (min-width: 768px) 58vw, 100vw"
            className="object-cover object-[50%_22%] transition-transform duration-500 group-hover:scale-[1.03]"
          />
        </span>

        <span className="flex flex-col justify-center border-t-2 border-black px-5 py-6 sm:px-8 md:border-t-0 md:border-s-2 md:py-8 lg:px-10">
          <span className="text-brand text-sm font-bold">חדש באתר</span>
          <span
            id="mall-promo-title"
            className="mt-1 text-[clamp(1.75rem,8vw,2.25rem)] leading-[1.05] font-black tracking-tight lg:text-[2.75rem]"
          >
            הקניון התלת־ממדי של BuyToday
          </span>
          <span aria-hidden className="bg-brand mt-4 block h-1.5 w-16" />
          <span className="text-muted-foreground mt-4 text-base leading-relaxed">
            מטיילים בין המחלקות עם הדמות שלכם, רואים את המוצרים והמבצעים האמיתיים, ולוחצים כדי לקנות.
          </span>
          <span className="bg-brand text-brand-foreground group-hover:bg-brand-hover mt-6 inline-flex h-12 w-fit items-center gap-2 px-6 text-base font-bold transition-colors">
            כניסה לקניון
            <ArrowLeft aria-hidden className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
        </span>
      </MallAnchor>
    </section>
  );
}
