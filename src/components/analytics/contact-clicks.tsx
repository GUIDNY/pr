"use client";

import { useEffect } from "react";
import { pushEvent } from "@/lib/analytics/ga";
import { trackMeta } from "@/lib/analytics/meta";
import { trackVisit } from "@/lib/pageview/track";

/**
 * A tap on the phone number or on WhatsApp is a lead, and until 30 October
 * nothing counted one. The paid test (Google Shopping against chat ads,
 * same days, same dryers) is decided on cost per enquiry, and an enquiry
 * here is far more often a call than a form.
 *
 * One listener on the document, in the capture phase, instead of a handler
 * on each of the dozen links: the header strip, the drawer, the product
 * page's consult card, the error page, the footer, the home page's shop
 * card. A link added tomorrow is counted without anybody remembering.
 *
 * Three places hear it, each on its own terms: GA4 through the dataLayer
 * (consent-gated, so the ad platforms can import it as a conversion), Meta
 * (its own gate), and the shop's own visit log (no consent needed, nothing
 * personal: a channel and a path). The href itself is never sent — it is
 * the shop's number, not the visitor's.
 */
function channelOf(href: string): "phone" | "whatsapp" | null {
  const h = href.toLowerCase();
  if (h.startsWith("tel:")) return "phone";
  if (h.includes("wa.me/") || h.includes("api.whatsapp.com") || h.startsWith("whatsapp:")) return "whatsapp";
  return null;
}

export function ContactClicks() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const channel = channelOf(a.getAttribute("href") ?? "");
      if (!channel) return;
      const path = window.location.pathname;
      pushEvent(channel === "phone" ? "phone_click" : "whatsapp_click", { page_path: path });
      trackMeta("Contact", { content_name: channel });
      trackVisit("contact_click", { channel, target: path });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
