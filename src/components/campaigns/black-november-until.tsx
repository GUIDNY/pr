import Link from "next/link";
import {
  BLACK_NOVEMBER_TERMS_HREF,
  BLACK_NOVEMBER_TERMS_TEXT,
  BLACK_NOVEMBER_UNTIL,
} from "@/lib/campaigns/black-november";

/**
 * The campaign's validity line, with its terms one tap away (owner,
 * 24 November): "עד 30.11 · עד גמר המלאי ובכפוף לתקנון המבצע", the last words
 * linking to /black-november/takanon. One component so the strip, the page,
 * the shelf and the product page cannot drift apart. Inside another link
 * (the strip), use `plain` and put the terms link beside it instead.
 */
export function BlackNovemberUntil({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      {BLACK_NOVEMBER_UNTIL} ·{" "}
      <Link href={BLACK_NOVEMBER_TERMS_HREF} className="underline underline-offset-2 hover:no-underline">
        {BLACK_NOVEMBER_TERMS_TEXT}
      </Link>
    </span>
  );
}
