import { SITE_URL, absoluteUrl } from "@/lib/site-url";
import { BUSINESS, SISTER_SITE } from "@/lib/business";
import { CATEGORY_TREE } from "@/lib/category-tree";

// Schema.org builders shared by the pages that emit structured data.
//
// The rule that shapes all of them: a field with no real value behind it is
// left out, never filled with something plausible. Google penalises invented
// structured data, and the same rule already governs product specs here.

export const SITE_NAME = BUSINESS.name;

/* Stable identities for the two entities every page can point at. An
   article's author and publisher used to be a fresh anonymous
   { "@type": "Organization", name } on each page, which to an engine is a
   different organisation from the one the homepage describes. One @id,
   stated on the homepage and referenced everywhere else, is what makes
   "published by Buy Today" resolve to the entity with the phone number,
   the registration number and the Merchant Center account. */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

/** The shop's phone number, as it appears in the header, footer and mobile nav. */
const PHONE_E164 = BUSINESS.phoneE164;

/**
 * Who the shop is. One per site, on the homepage.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
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
    /* Two ways in, said separately, because they are open at different
       times. One contactPoint carrying both the number and "always open"
       would be a claim that the phone is answered at 02:00.

       hoursAvailable is read by Google and shown beside the number in a
       result, which is exactly why it has to be the real hours: a result
       that says open, on a call nobody picks up, is the same broken
       promise as a delivery estimate the page contradicts. */
    contactPoint: [
      {
        "@type": "ContactPoint",
        telephone: PHONE_E164,
        contactType: "customer service",
        areaServed: "IL",
        availableLanguage: ["he"],
        email: BUSINESS.email,
        hoursAvailable: BUSINESS.phoneHours.map((h) => ({
          "@type": "OpeningHoursSpecification",
          dayOfWeek: h.days.map((d) => `https://schema.org/${d}`),
          opens: h.opens,
          closes: h.closes,
        })),
      },
      {
        "@type": "ContactPoint",
        telephone: BUSINESS.whatsappE164,
        contactType: "customer support",
        areaServed: "IL",
        availableLanguage: ["he"],
        /* No hoursAvailable and no 24/7 claim either. An assistant replies
           at any hour and a person does not, and schema.org has no way to
           say that — so it says nothing rather than something untrue. The
           contact page spells it out in words, where the distinction fits. */
      },
    ],
    // The shop's real street address, which is what lets Google tie this site
    // to the Business Profile and the Merchant Center account rather than
    // treating them as three unrelated things. No postalCode: it is not known
    // here, and the rule at the top of this file holds — a field with nothing
    // real behind it is left out rather than filled with something plausible.
    address: {
      "@type": "PostalAddress",
      streetAddress: BUSINESS.street,
      addressLocality: BUSINESS.city,
      addressRegion: BUSINESS.region,
      addressCountry: BUSINESS.country,
    },
    /* What this shop sells, named rather than left to be inferred from a
       catalogue an engine has to crawl first. Taken from CATEGORY_TREE —
       the departments, which are the level a person would name — so the
       list cannot drift from the site's own navigation, and adding a
       department adds it here with nothing to remember. */
    knowsAbout: CATEGORY_TREE.map((department) => department.name),
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
    sameAs: [
      ...BUSINESS.googleBusinessProfiles,
      BUSINESS.instagram,
      BUSINESS.facebook,
      BUSINESS.threads,
      SISTER_SITE.url,
      SISTER_SITE.facebook,
    ].filter(Boolean),
  };
}

/**
 * A page that is about the business itself.
 *
 * /page/about carried no structured data at all: 564 words that say who
 * this shop is, and nothing joining them to the entity they describe. The
 * graph says it in one move — this page, the organization it is about, and
 * the site it belongs to — through the same @ids the homepage and the
 * articles already declare, so an engine reading any of the three is
 * reading about one thing rather than three.
 */
export function aboutPageSchema(input: { path: string; name: string; description?: string | null }) {
  const url = absoluteUrl(input.path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "AboutPage",
        "@id": `${url}#webpage`,
        url,
        name: input.name,
        ...(input.description ? { description: input.description } : {}),
        inLanguage: "he-IL",
        isPartOf: { "@id": WEBSITE_ID },
        mainEntity: { "@id": ORGANIZATION_ID },
      },
    ],
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
    "@id": WEBSITE_ID,
    publisher: { "@id": ORGANIZATION_ID },
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

export type ArticleFaqItem = { q: string; a: string };

/**
 * An article, as one graph.
 *
 * Three separate blocks — Article, FAQPage, BreadcrumbList — leave an engine
 * to guess which is the page's main entity and whether the FAQ belongs to
 * the article or stands alone. A @graph says it: the WebPage, the
 * BlogPosting that is its main entity, and (when the article carries a
 * שאלות נפוצות section) the FAQPage that is part of the same page. Author
 * and publisher point at the Organization the homepage declares.
 *
 * The FAQ items are the ones the page renders — see faqItems in
 * queries/articles — so the markup can never claim a question the reader
 * does not see, which is the rule Google removes FAQ markup over.
 */
/**
 * A brand's shelf, as one graph.
 *
 * Brand pages emitted nothing at all — not a breadcrumb, not a type, not a
 * link to the shop — while the homepage declares an Organization and every
 * product page a Product. Ninety pages that an engine could only read as
 * prose.
 *
 * CollectionPage rather than Product: the page is a list of things for
 * sale, and saying Product here would make ninety pages claim to be one
 * item each. The ItemList inside names the products actually on the page,
 * in the order they are shown, which is the part an answer engine lifts.
 */
export function brandGraphSchema(input: {
  path: string;
  name: string;
  description: string;
  products: { slug: string; title: string }[];
}) {
  const url = absoluteUrl(input.path);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": `${url}#webpage`,
        url,
        name: input.name,
        description: input.description,
        inLanguage: "he-IL",
        isPartOf: { "@id": WEBSITE_ID },
        publisher: { "@id": ORGANIZATION_ID },
        ...(input.products.length > 0
          ? {
              mainEntity: {
                "@type": "ItemList",
                numberOfItems: input.products.length,
                itemListElement: input.products.map((p, i) => ({
                  "@type": "ListItem",
                  position: i + 1,
                  url: absoluteUrl(`/product/${p.slug}`),
                  name: p.title,
                })),
              },
            }
          : {}),
      },
    ],
  };
}

export function articleGraphSchema(input: {
  path: string;
  headline: string;
  description: string;
  imageUrl?: string | null;
  datePublished: string;
  dateModified: string;
  faq: ArticleFaqItem[];
}) {
  const url = absoluteUrl(input.path);
  const pageId = `${url}#webpage`;
  const articleId = `${url}#article`;
  const graph: Record<string, unknown>[] = [
    {
      "@type": "WebPage",
      "@id": pageId,
      url,
      name: input.headline,
      inLanguage: "he-IL",
      isPartOf: { "@id": WEBSITE_ID },
      mainEntity: { "@id": articleId },
    },
    {
      "@type": "BlogPosting",
      "@id": articleId,
      mainEntityOfPage: { "@id": pageId },
      url,
      headline: input.headline.slice(0, 110),
      description: input.description,
      inLanguage: "he-IL",
      datePublished: input.datePublished,
      dateModified: input.dateModified,
      ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
      author: { "@id": ORGANIZATION_ID },
      publisher: { "@id": ORGANIZATION_ID },
    },
  ];
  if (input.faq.length > 0) {
    graph.push({
      "@type": "FAQPage",
      "@id": `${url}#faq`,
      isPartOf: { "@id": pageId },
      inLanguage: "he-IL",
      mainEntity: input.faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}
