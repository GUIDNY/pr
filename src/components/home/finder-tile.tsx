import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";

/** The phone's "help me choose" row — Alfred as a convenience, one line tall. */
export function FinderTile() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-2">
      <Link
        href="/finder"
        className="bg-card text-foreground flex items-center gap-3 rounded-2xl px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)] active:scale-[0.99]"
      >
        <Image
          src="/mascot/alfred.png"
          alt=""
          width={44}
          height={44}
          className="size-11 shrink-0 rounded-full object-cover object-top"
        />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1 text-base leading-tight font-bold">
            לא בטוחים מה לבחור?
            <Sparkles className="text-brand size-4" />
          </span>
          <span className="text-muted-foreground block text-xs leading-tight">כמה שאלות קצרות, ואלפרד ימליץ על המוצר המתאים</span>
        </span>
        <ArrowLeft className="text-brand size-5 shrink-0" />
      </Link>
    </div>
  );
}
