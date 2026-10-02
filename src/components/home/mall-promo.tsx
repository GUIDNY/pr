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
 * A plain card, on purpose. The first version was a navy-to-orange gradient
 * with a perspective floor behind the text, and between two rows of white
 * product cards it read as an advertisement that had been dropped into the
 * page. This one is drawn like the finder tile and the product cards around
 * it — white, a hairline, the brand colour only on the button — so it reads
 * as one more thing the shop offers.
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
    <section aria-labelledby="mall-promo-title" className="mx-auto max-w-7xl px-4 py-3 lg:py-4">
      <MallAnchor
        medium="home"
        className="group bg-card text-foreground flex flex-col overflow-hidden rounded-2xl shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)] transition-shadow hover:shadow-[0_2px_8px_rgb(0_0_0/0.08),0_0_0_1px_rgb(0_0_0/0.06)] active:scale-[0.995] sm:flex-row sm:items-center"
      >
        <span className="relative block aspect-[1200/630] max-h-40 w-full shrink-0 overflow-hidden sm:order-last sm:m-3 sm:aspect-[16/10] sm:max-h-none sm:w-[34%] sm:rounded-xl lg:w-[30%]">
          <Image
            src="https://play.buytoday.co.il/og.jpg"
            alt="הקניון התלת־ממדי של BuyToday: מחלקות, מסכי מבצעים ודמות שמטיילת ביניהם"
            width={1200}
            height={630}
            sizes="(min-width: 1024px) 380px, (min-width: 640px) 34vw, 100vw"
            className="size-full object-cover object-[50%_30%]"
          />
        </span>

        <span className="flex flex-1 flex-col justify-center gap-1.5 px-5 py-4 lg:px-7">
          <span className="text-brand text-xs font-bold">חדש · קניון תלת־ממדי</span>
          <span id="mall-promo-title" className="text-lg leading-tight font-bold sm:text-xl">
            טיילו בקניון הווירטואלי של BuyToday
          </span>
          <span className="text-muted-foreground text-sm leading-snug">
            עוברים בין המחלקות עם הדמות שלכם, רואים את המבצעים והמוצרים האמיתיים, ולוחצים כדי לקנות
          </span>
          <span className="bg-brand text-brand-foreground group-hover:bg-brand-hover mt-2 inline-flex h-10 w-fit items-center gap-2 rounded-lg px-5 text-sm font-bold transition-colors">
            כניסה לקניון
            <ArrowLeft aria-hidden className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
        </span>
      </MallAnchor>
    </section>
  );
}
