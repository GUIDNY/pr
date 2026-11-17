"use client";

import { useState } from "react";
import { Check, ChevronLeft, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
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
  /* On a phone the title is clamped to two lines, and a tap there now opens
     it in full instead of jumping to the description. Clarity, ChatGPT
     visitors 11–17 November: in 3 of 4 product-page recordings the title
     was tapped — 17 times and 4 rage clicks in one — and recorded as a dead
     click each time. From md up nothing is clamped and the tap keeps
     opening the overview tab. */
  const [expanded, setExpanded] = useState(false);
  return (
    <h1
      onClick={() => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        if (window.matchMedia("(max-width: 767px)").matches) {
          setExpanded((v) => !v);
          return;
        }
        openTab("overview");
      }}
      /* Two lines on a phone (17 November). The catalogue's titles run to
         three or four lines at 375px — brand, Hebrew and English name,
         wattage, a list of features — and pushed the price and the stock
         line under the buy bar on the pages paid traffic lands on. The
         whole title stays in the DOM for search and screen readers, in the
         tooltip, and in full from md: up. */
      title={title}
      className={cn(
        "mt-1 cursor-pointer text-xl leading-snug font-bold sm:text-3xl sm:leading-tight md:text-2xl lg:text-3xl",
        !expanded && "max-md:line-clamp-2",
      )}
    >
      {title}
    </h1>
  );
}

/** The model code with a copy button — what the visitors tapping the title
    were most plausibly after: the code to compare a price or paste back into
    a chat. Copies the model only, never the SKU. */
export function ModelWithCopy({ model }: { model: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>
        דגם: <bdi>{model}</bdi>
      </span>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(model);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            /* clipboard blocked: the code is on screen to select by hand */
          }
        }}
        className="text-brand hover:bg-muted inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium"
        aria-label={`העתק דגם ${model}`}
      >
        {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        {copied ? "הועתק" : "העתק דגם"}
      </button>
    </span>
  );
}
