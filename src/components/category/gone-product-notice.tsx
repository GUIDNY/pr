"use client";

import { useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { BUSINESS } from "@/lib/business";

/** A model name as the product page writes it: brand and model, letters,
    digits and the usual punctuation. Anything else is not shown, so the
    parameter cannot be used to print arbitrary text on the shop's page. */
const MODEL_LABEL = /^[\p{L}\p{N} .\-/+'"()]{2,60}$/u;

/**
 * Said at the top of a category when a visitor was sent here from a product
 * that is no longer on the site (product/[slug]/page.tsx adds ?gone=).
 *
 * Most of these visitors come from ChatGPT, which recommended one exact model
 * by name. Landing on a shelf of other models with no word about the one they
 * asked for reads like a broken link; 70 of the channel's 455 product landings
 * in the 30 days to 17 November were exactly that. One line says what
 * happened, that the rest of the shelf is what is available now, and how to
 * ask for a recommendation.
 *
 * Client-side and behind Suspense in the caller, so the category page stays
 * the cached, parameter-blind page it is for every other visitor.
 */
export function GoneProductNotice() {
  const label = useSearchParams().get("gone")?.trim();
  if (!label || !MODEL_LABEL.test(label)) return null;
  return (
    <p className="bg-muted text-foreground mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-sm" role="status">
      <Info className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <bdi className="font-medium">{label}</bdi> כבר לא נמכר אצלנו. אלה הדגמים שיש לנו עכשיו בקטגוריה. רוצים המלצה על
        חלופה?{" "}
        <a href={BUSINESS.phoneHref} className="text-primary font-medium underline-offset-2 hover:underline">
          {BUSINESS.phone}
        </a>
      </span>
    </p>
  );
}
