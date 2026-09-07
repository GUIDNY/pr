import { SITE_URL, absoluteUrl } from "@/lib/site-url";

// Schema.org builders shared by the pages that emit structured data.
//
// The rule that shapes all of them: a field with no real value behind it is
// left out, never filled with something plausible. Google penalises invented
// structured data, and the same rule already governs product specs here.

export const SITE_NAME = "Buy Today";

/** The shop's phone number, as it appears in the header, footer and mobile nav. */
const PHONE_E164 = "+972-4-6639510";

/**
 * Who the shop is. One per site, on the homepage.
 *
 * No `sameAs`. The only social link in the footer points at
 * https://www.facebook.com/ — Facebook's own homepage, a placeholder nobody
 * filled in — and declaring that as the shop's profile is worse than
 * declaring nothing. It goes in the day a real page exists.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    // The company behind the shop. Google checks the name, phone and address
    // it finds here against the Business Profile and the Merchant Center
    // account, and disagreement between them is what breaks that match — so
    // the trading name and the registered name are both stated rather than
    // one standing in for the other.
    legalName: "פ.ר. אלקטרוניקה",
    url: SITE_URL,
    logo: absoluteUrl("/brand/logo.png"),
    email: "info@prec.co.il",
    description:
      "חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. מקררים, מכונות כביסה, טלוויזיות ועוד, עם משלוח עד הבית ואחריות יבואן רשמי.",
    contactPoint: {
      "@type": "ContactPoint",
      telephone: PHONE_E164,
      contactType: "customer service",
      areaServed: "IL",
      availableLanguage: ["he"],
      email: "info@prec.co.il",
    },
    // address and sameAs are deliberately absent, not empty. A postal address
    // has to be the real registered one and the social links have to be real
    // profiles; a placeholder in either is a lie Google can check. A missing
    // field costs nothing, a wrong one costs trust.
  };
}

/**
 * The site itself, and how to search it. The SearchAction is what lets an
 * engine offer a search box for this shop directly in a result.
 *
 * The target has to be the address the site actually serves — /search?q= is
 * what the header's search bar navigates to.
 */
export function webSiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    inLanguage: "he-IL",
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: absoluteUrl("/search?q={search_term_string}"),
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/** The trail to a page, in the order a reader walks it. Positions are 1-based. */
export function breadcrumbSchema(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((step, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: step.name,
      item: absoluteUrl(step.path),
    })),
  };
}

/**
 * The products on a listing page, in the order they are shown.
 *
 * Deliberately a list of URLs rather than a repeat of each product's full
 * Product schema: the product pages already carry that, and restating price
 * and availability here gives Google a second copy to find disagreeing with
 * the first the moment stock moves.
 */
export function itemListSchema(name: string, items: { slug: string; title: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((p, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: p.title,
      url: absoluteUrl(`/product/${p.slug}`),
    })),
  };
}
