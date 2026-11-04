"use client";

import { usePathname } from "next/navigation";
import { BUSINESS } from "@/lib/business";
import { showsBottomNav } from "@/lib/bottom-nav";
import { SITE_URL } from "@/lib/site-url";
import { cn } from "@/lib/utils";

/**
 * The green WhatsApp bubble, on every shopping page.
 *
 * Asked for by the shop on 1 November, from a shopper's point of view: on
 * any site, the WhatsApp bubble is the first thing people look for when
 * they want to talk to someone. Until then the number was only in the
 * footer and on the contact page, so a phone visitor had to scroll to the
 * bottom of a long page to find it.
 *
 * It sits on the start edge (the right in RTL), above Alfred, so that each
 * corner has one job: the accessibility launcher has the other one to
 * itself. The heights follow Alfred's own launcher, which moves:
 *  - phone, where the tab bar shows: Alfred is a tab and has no bubble, so
 *    this sits just above the bar, level with the accessibility launcher;
 *  - phone without the bar (product page) and tablet: above Alfred's
 *    bubble at bottom-24;
 *  - desktop: above Alfred's bubble at bottom-6.
 * z-40 is below Alfred's panel (z-50), so an open chat covers this button
 * instead of the button sitting on top of the conversation.
 *
 * It is a plain wa.me link, so ContactClicks counts every tap as a
 * whatsapp_click lead with no wiring here. On a product page the message
 * arrives already typed with the product's address, so whoever answers
 * knows which item it is about without asking.
 *
 * Rendered inside ShoppingOnly in the root layout, so it is not on the
 * payment step, where the bottom of a phone screen belongs to the pay
 * button. It is also hidden in the back office.
 */
export function WhatsAppButton() {
  const pathname = usePathname() ?? "/";
  if (pathname.startsWith("/admin") || pathname.startsWith("/product-admin")) return null;

  const hasTab = showsBottomNav(pathname);
  const text = pathname.startsWith("/product/")
    ? `שלום, אשמח לפרטים על המוצר הזה: ${SITE_URL}${pathname}`
    : "שלום, הגעתי מהאתר ואשמח לעזרה";
  const href = `${BUSINESS.whatsappHref}?text=${encodeURIComponent(text)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="שלחו לנו הודעה בוואטסאפ"
      title="דברו איתנו בוואטסאפ"
      className={cn(
        "floating-launcher animate-in fade-in zoom-in-50 fixed start-4 z-40 flex size-12 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg duration-500 transition-transform hover:scale-105 sm:size-14",
        hasTab ? "bottom-20" : "bottom-42",
        "sm:bottom-42 lg:bottom-24"
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-7 fill-current sm:size-8">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
      </svg>
    </a>
  );
}
