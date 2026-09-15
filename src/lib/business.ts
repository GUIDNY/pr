/**
 * Who the shop is, in one place.
 *
 * The phone number was already written out in fifteen files and stayed
 * identical in all of them, which is luck rather than design — the next
 * change to it is fifteen edits and one of them gets missed. The address
 * arrives now, so it starts here instead of starting scattered.
 *
 * These are not secrets and not settings: a shop's name, phone and street
 * are the same in every environment, and putting them behind environment
 * variables would only mean a preview deployment that renders a blank
 * address. SITE_URL is a variable because it genuinely differs per
 * deployment. This does not.
 *
 * Google reads the name, phone and address out of the JSON-LD on the
 * homepage and checks them against the Business Profile and the Merchant
 * Center account for buytoday.co.il. Disagreement between the three is what
 * breaks that match, so anything changed here has to be changed there too —
 * and the reverse.
 */
export const BUSINESS = {
  /** The trading name. What customers call the shop, and what the logo says. */
  name: "Buy Today",
  /** The registered company behind it. Both are stated to Google, not one for the other. */
  legalName: 'פ.ר. אלקטרוניקה והשקעות (1999) בע"מ',
  /** Company registration number. Named in the terms and the privacy policy —
      a shop that takes money has to say who is taking it. */
  companyId: "512801093",

  /* The service line — the number on the Business Profile, which is what a
     customer should reach. It replaced an older number that was still
     written out in fourteen files by hand; see the note above. */
  /** As printed on the site. */
  phone: "04-622-4041",
  /** As dialled. Hyphens are legal in a tel: URI and help a screen reader group the digits. */
  phoneHref: "tel:04-622-4041",
  /** As schema.org wants it. */
  phoneE164: "+972-4-622-4041",

  /* WhatsApp is a different number, and it is shown as its own channel
     rather than as a second way to reach the line above. A number labelled
     "WhatsApp" that does not answer WhatsApp is worse than not offering
     one at all. */
  whatsapp: "055-307-3072",
  /** wa.me takes digits only, international, with no plus and no leading zero. */
  whatsappHref: "https://wa.me/972553073072",
  whatsappE164: "+972-55-307-3072",

  /* The shop's own pages on the two networks it actually posts to.
     They are listed here rather than inline in the footer because the footer
     is not their only reader: schema.ts declares them as the Organization's
     sameAs, which is how Google ties this domain, the Business Profile and
     those two profiles together into one entity instead of three. A link
     that appears in one place and not the other breaks exactly that match.

     The Facebook address is the canonical one the numeric profile.php?id=
     form redirects to. Both work; this one avoids the redirect and says the
     page's name out loud, which is what a shared link shows. */
  instagram: "https://www.instagram.com/buytoday.co.il/",
  facebook: "https://www.facebook.com/people/BuyToday/61593689074664/",

  street: "דוד אלעזר 27",
  city: "חדרה",
  /** ISO 3166-1 alpha-2, which is the form schema.org expects. */
  country: "IL",
} as const;

/** The address on one line, the way it is written on an envelope here. */
export const BUSINESS_ADDRESS = `${BUSINESS.street}, ${BUSINESS.city}`;

/**
 * A link that opens the shop in whatever maps app the visitor has.
 *
 * Google's universal URL rather than a pinned coordinate: the coordinate
 * would have to be looked up and kept correct, and a search by address hands
 * the job to the map, which already knows. It is also the form iOS and
 * Android both hand off to their own maps app.
 */
export const BUSINESS_MAP_URL = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
  `${BUSINESS_ADDRESS}, ישראל`,
)}`;
