import { SITE_URL, absoluteUrl } from "@/lib/site-url";
import { BUSINESS, SISTER_SITE } from "@/lib/business";

// Schema.org builders shared by the pages that emit structured data.
//
// The rule that shapes all of them: a field with no real value behind it is
// left out, never filled with something plausible. Google penalises invented
// structured data, and the same rule already governs product specs here.

export const SITE_NAME = BUSINESS.name;

/** The shop's phone number, as it appears in the header, footer and mobile nav. */
const PHONE_E164 = BUSINESS.phoneE164;

/**
 * Who the shop is. One per site, on the homepage.
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
    legalName: BUSINESS.legalName,
    /* The company registration number. Named in the terms and in the footer
       already; stated here so the entity Google builds from this page and
       the one in the Companies Registrar are provably the same, rather than
       two businesses that happen to share a name. */
    taxID: BUSINESS.companyId,
    url: SITE_URL,
    /* The same artwork, at an address Google has not already cached.
       The file at /brand/logo.png has been the Buy Today mark for a while —
       nothing is wrong with the picture. What is wrong is that Google
       fetched that URL once, while it still held the A&I Electronics mark,
       and a stable URL gives it no reason to look again; the old logo is
       still what a search result shows.

       So the bytes move to a new name and this line follows them. Every
       other reference — the header, the footer, the email template, the
       payment page — keeps /brand/logo.png and is unaffected: those are
       served through next/image or read by a mail client, neither of which
       has this problem. This one field is the one Google reads.

       Do not rename this back, and do not point it at /brand/logo.png
       again "to tidy up" — that is the cached address. */
    logo: absoluteUrl("/brand/logo-buytoday-v2.png"),
    email: BUSINESS.email,
    description:
      "חנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי. מקררים, מכונות כביסה, טלוויזיות ועוד, עם משלוח עד הבית ואחריות יבואן רשמי.",
    contactPoint: {
      "@type": "ContactPoint",
      telephone: PHONE_E164,
      contactType: "customer service",
      areaServed: "IL",
      availableLanguage: ["he"],
      email: BUSINESS.email,
    },
    // The shop's real street address, which is what lets Google tie this site
    // to the Business Profile and the Merchant Center account rather than
    // treating them as three unrelated things. No postalCode: it is not known
    // here, and the rule at the top of this file holds — a field with nothing
    // real behind it is left out rather than filled with something plausible.
    address: {
      "@type": "PostalAddress",
      streetAddress: BUSINESS.street,
      addressLocality: BUSINESS.city,
      addressCountry: BUSINESS.country,
    },
    /* The other places this same business exists. sameAs is how Google is
       told that the Instagram account, the Facebook page and this domain are
       one entity rather than three unrelated ones — the same consolidation
       the name, phone and address above are doing against the Business
       Profile and Merchant Center.

       It was deliberately empty until now, because the only social link in
       the footer pointed at Facebook's own homepage and declaring a
       placeholder as the shop's profile is worse than declaring nothing.
       These come from BUSINESS, which is also what the footer renders, so a
       claim made here is a link a visitor can actually follow. Nothing goes
       in this list that is not a profile the shop controls. */
    /* prec.co.il is the same company's other shopfront — the same catalogue,
       the same counter in Hadera, the same people. Two commerce sites with
       one inventory and one address look like two businesses pretending to
       be unrelated unless the link is declared, and declared it is simply
       one business with two fronts. The footer and the about page say the
       same thing in words, for the reader rather than the crawler. */
    sameAs: [BUSINESS.instagram, BUSINESS.facebook, SISTER_SITE.url, SISTER_SITE.facebook],
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
