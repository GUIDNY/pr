"use client";

import { ChevronLeft } from "lucide-react";
import { PDP_TABS_ID, pdpTabTriggerId } from "@/lib/pdp-tabs";

/* Things on the product page that people tap and that used to do nothing.

   Microsoft Clarity's recordings of paid visitors, week of 8 November,
   showed the same dead clicks again and again: the spec chips under the
   title, the title itself, and the SKU/model line. A tap that does nothing
   reads as a broken page, and a visitor who came from an ad gives the page
   one or two of those before leaving. Each of these now answers with the
   thing the tap was most plausibly looking for — the full spec table for a
   chip, the description for the title — rather than with nothing.

   The info tabs below are Radix tabs rendered by a server component, so
   they are switched the way a person switches them: a primary-button
   mousedown on the trigger, which is what Radix listens to. */


function openTab(value: string) {
  const trigger = document.getElementById(pdpTabTriggerId(value));
  trigger?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
  /* After the tab content has swapped in, so the scroll lands on the
     content that is actually there. */
  requestAnimationFrame(() => {
    document.getElementById(PDP_TABS_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

export function SpecChips({ chips }: { chips: { label: string; value: string }[] }) {
  if (chips.length === 0) return null;
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5">
      {chips.map((row) => (
        <li key={row.label}>
          <button
            type="button"
            onClick={() => openTab("specs")}
            className="bg-muted text-foreground hover:bg-muted/70 rounded-lg px-2.5 py-1 text-start text-xs transition-colors"
          >
            <span className="text-muted-foreground">{row.label}: </span>
            <span className="font-semibold">{row.value}</span>
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => openTab("specs")}
          className="text-brand flex items-center gap-0.5 rounded-lg px-1.5 py-1 text-xs font-semibold hover:underline"
        >
          למפרט המלא
          <ChevronLeft className="size-3.5" aria-hidden="true" />
        </button>
      </li>
    </ul>
  );
}

/* The title stays a heading — it is what a screen reader and a search
   engine read as the page's name — and a tap on it opens the overview.
   Not when the tap ends a text selection: people select a model name to
   copy it, and moving the page under them would be worse than nothing. */
export function ProductTitle({ title }: { title: string }) {
  return (
    <h1
      onClick={() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        openTab("overview");
      }}
      className="mt-1 cursor-pointer text-xl leading-snug font-bold sm:text-3xl sm:leading-tight md:text-2xl lg:text-3xl"
    >
      {title}
    </h1>
  );
}
