import Image from "next/image";
import { ArrowLeft, Gamepad2 } from "lucide-react";
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
 * The whole card is the link, not only the button in it: on a phone a thumb
 * lands anywhere on a card, and a card that only answers on one part of
 * itself reads as broken. The "button" is therefore a span that looks like
 * one — a real button inside a link is an interactive element inside
 * another, which assistive technology announces badly.
 *
 * The picture is the game's own share image, loaded from the game's host:
 * nothing new to keep in this repo, and it changes when the mall does. The
 * floor grid behind the text is an inline SVG — the mall's tiled floor,
 * receding — so the card says "a place" before anybody reads it.
 *
 * Server-rendered; only MallAnchor is a client component, so the homepage
 * stays as cacheable as it is.
 */
export function MallPromo() {
  return (
    <section aria-labelledby="mall-promo-title" className="mx-auto max-w-7xl px-4 py-3 lg:py-5">
      <MallAnchor
        medium="home"
        className="group bg-primary text-primary-foreground relative isolate flex flex-col overflow-hidden rounded-2xl shadow-lg ring-1 ring-black/5 transition-transform active:scale-[0.995] sm:flex-row sm:items-stretch"
      >
        {/* Navy into the brand orange — the same two colours as the hero
            band, so the card belongs to this page rather than to an ad. */}
        <span
          aria-hidden
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 70% 120% at 100% 100%, oklch(0.658 0.209 39.1 / 0.55), transparent 70%), radial-gradient(ellipse 60% 90% at 0% 0%, oklch(0.42 0.12 264 / 0.9), transparent)",
          }}
        />
        <FloorGrid />

        <span className="relative block aspect-[1200/630] max-h-44 w-full shrink-0 overflow-hidden sm:order-last sm:m-4 sm:aspect-auto sm:max-h-none sm:w-[44%] sm:rounded-xl sm:shadow-2xl sm:ring-1 sm:ring-white/20 lg:w-[40%]">
          <Image
            src="https://play.buytoday.co.il/og.jpg"
            alt="הקניון התלת־ממדי של BuyToday: מחלקות, מסכי מבצעים ודמות שמטיילת ביניהם"
            width={1200}
            height={630}
            sizes="(min-width: 1024px) 480px, (min-width: 640px) 44vw, 100vw"
            className="size-full object-cover object-[50%_30%] transition-transform duration-500 group-hover:scale-[1.03]"
          />
          <span className="bg-brand text-brand-foreground absolute top-2 start-2 rounded-full px-2.5 py-0.5 text-[11px] font-bold shadow">
            חדש
          </span>
        </span>

        <span className="relative flex flex-1 flex-col justify-center gap-2 px-5 py-4 sm:py-6 lg:px-8">
          <span className="text-brand flex items-center gap-1.5 text-xs font-bold tracking-wide">
            <Gamepad2 aria-hidden className="size-4" />
            משחק · קניון תלת־ממדי
          </span>
          <span id="mall-promo-title" className="text-xl leading-tight font-black sm:text-2xl lg:text-3xl">
            הקניון התלת־ממדי של BuyToday
          </span>
          <span className="text-primary-foreground/80 text-sm leading-snug sm:text-base">
            מטיילים בין המחלקות, רואים מבצעים ומוצרים אמיתיים, ונכנסים עם הדמות שלכם
          </span>
          <span className="bg-brand text-brand-foreground group-hover:bg-brand-hover mt-2 inline-flex w-fit items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-md transition-colors sm:text-base">
            כניסה לקניון
            <ArrowLeft aria-hidden className="size-4 transition-transform group-hover:-translate-x-0.5" />
          </span>
        </span>
      </MallAnchor>
    </section>
  );
}

/** The mall's tiled floor in perspective, faint, behind the text. */
function FloorGrid() {
  const rows = [0.55, 0.64, 0.75, 0.88];
  const cols = [-0.6, -0.3, 0, 0.3, 0.6, 0.9, 1.2, 1.5, 1.8];
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 200"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-2/3 w-full opacity-[0.12]"
    >
      {rows.map((y) => (
        <line key={y} x1="0" x2="400" y1={y * 200} y2={y * 200} stroke="white" strokeWidth="1" />
      ))}
      {cols.map((x) => (
        <line key={x} x1={200} y1={80} x2={x * 400} y2={200} stroke="white" strokeWidth="1" />
      ))}
    </svg>
  );
}
