import Image from "next/image";
import { AlfredPicks } from "@/components/home/alfred-picks";
import type { ProductCardData } from "@/components/product/product-card";

/**
 * Alfred, doing a tool's job.
 *
 * He used to open the homepage: the page's only <h1> was "תנו לאלפרד לעבוד
 * בשבילכם", set over a full-bleed navy block with his portrait and the
 * search bar. That made the shop's first claim a claim about its software,
 * to a visitor who has not yet been told the shop is real, has 1,365
 * appliances, or has a counter in Hadera.
 *
 * He is not removed, because he is genuinely useful and the conversation
 * here is real — it runs against the same /api/alfred-chat endpoint as the
 * floating widget, with the admin's chosen products pinned into its context
 * so he can talk about them by name and price. He is placed instead: after
 * the catalogue has been shown, where "not sure which one?" is a question
 * the visitor has actually arrived at rather than one put to them at the
 * door.
 *
 * Light ground, half the height, no <h1>. The picks are still curated at
 * /admin/homepage-alfred and still land here.
 */
export function AlfredHelper({ picks }: { picks: ProductCardData[] }) {
  if (picks.length === 0) return null;

  return (
    <section className="mx-auto max-w-7xl px-4 py-10">
      <div className="border-border bg-card grid grid-cols-1 items-center gap-6 rounded-2xl border p-5 sm:p-7 lg:grid-cols-[auto_1fr] lg:gap-10">
        <div className="flex items-center gap-4 lg:max-w-xs lg:flex-col lg:items-start lg:gap-3">
          <Image
            src="/mascot/alfred.png"
            alt=""
            width={280}
            height={280}
            className="h-auto w-16 shrink-0 lg:w-28"
          />
          <div>
            <h2 className="text-lg font-bold sm:text-xl">לא בטוחים איזה דגם מתאים?</h2>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              אלפרד מכיר את כל מה שיש לנו במלאי. תשאלו אותו על המוצרים האלה, או על כל דבר אחר
              שאתם מחפשים.
            </p>
          </div>
        </div>

        <AlfredPicks products={picks} />
      </div>
    </section>
  );
}
