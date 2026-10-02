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
/**
 * The same company's other shop.
 *
 * פר אלקטרוניקה at prec.co.il is not a competitor and not a legacy site left
 * running: it is this company, this catalogue and this counter, under the
 * name it traded as before Buy Today. Google sees two commerce domains with
 * one inventory and one street address, and an undeclared relationship there
 * reads as two businesses posing as independent. Declared, it is ordinary.
 *
 * So it is stated in three places, deliberately: the Organization JSON-LD
 * (sameAs), the footer, and the about page — machine, glance and sentence.
 */
export const SISTER_SITE = {
  name: "פר אלקטרוניקה",
  url: "https://www.prec.co.il/",
  facebook: "https://www.facebook.com/PREC.CO.IL/",
  /** Without the scheme and the trailing slash, for printing in a sentence. */
  label: "prec.co.il",
} as const;

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

  /* When a person actually picks it up.
     Stated because the alternative is a customer calling at 19:00, getting
     nothing, and concluding the shop is gone — and because Google reads
     opening hours out of the structured data and shows them next to the
     number in a search result. An unanswered call at an hour the result
     said was open is the same broken promise as a delivery estimate that
     does not match the page.

     Written once, here, in the shape schema.org wants (24-hour, "HH:MM"),
     and formatted for people where it is shown. The site has already been
     through one number written out by hand in fifteen files. */
  phoneHours: [
    { days: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday"], opens: "10:30", closes: "18:00" },
    { days: ["Friday"], opens: "10:30", closes: "13:00" },
  ],
  /** For the people-facing line. Saturday is absent above and said here. */
  phoneHoursLabel: "א׳–ה׳ 10:30–18:00 · ו׳ 10:30–13:00 · שבת סגור",

  /* WhatsApp is a different number, and it is shown as its own channel
     rather than as a second way to reach the line above. A number labelled
     "WhatsApp" that does not answer WhatsApp is worse than not offering
     one at all. */
  /* One address, because there were three.
     service@prec.co.il was on the accessibility statement, the privacy
     policy and the contact page; info@prec.co.il was on the returns policy
     and in the Organization JSON-LD; and the CMS pages had been moved to a
     third. Five files, three answers to "how do I reach this shop" — and
     two of them on a domain that is not this one.

     It sits here for the same reason the phone number does: the next change
     to it is one edit rather than five, and the one that gets missed is
     always the legal page nobody reads until they need it.

     The personal mailbox that stood in while the business had none is gone:
     the terms name this address in three places — who we are, how to send a
     cancellation notice, and how to reach us — and a legal document naming
     one address while the footer prints another is the disagreement that
     matters most, because the page a customer reaches for is the one they
     read when something has gone wrong.

     It is on buytoday.co.il as of the Merchant Center review, and the
     paragraph above predicted the move: a shop declaring a contact address
     on a different domain entirely is one of the patterns a misrepresentation
     review is looking for, and this one appeared twice in the Organization
     JSON-LD and again in the terms. Google matches the address here against
     the Business Profile and the Merchant Center account, so those two have
     to carry the same one. */
  email: "info@buytoday.co.il",

  /* The mobile the shop answers, and the number the HEADER offers to call.
     Not a replacement for `phone` above: that one is the service line on the
     Business Profile and in the JSON-LD, it is what Google matches against
     Merchant Center, and it is named in the terms and on every legal page.
     Changing it there would break the match this file exists to protect.

     The header is a different job — it is the one line a visitor decides on,
     and the shop would rather that tap reach a mobile than a switchboard.
     Same digits as WhatsApp below, because it is the same handset; kept as
     its own pair so that a future change to one does not silently move the
     other. */
  mobile: "055-307-3072",
  mobileHref: "tel:055-307-3072",

  whatsapp: "055-307-3072",
  /** wa.me takes digits only, international, with no plus and no leading zero. */
  whatsappHref: "https://wa.me/972553073072",
  whatsappE164: "+972-55-307-3072",
  /* The one channel that answers at any hour — and it is worth saying what
     answers. "24/7" next to a phone icon reads as "somebody is there",
     which is not true at 02:00 and is the kind of small overclaim that
     costs more than it buys. An assistant replies immediately whenever you
     write; a person picks it up in the hours above. */
  whatsappHoursLabel: "מענה אוטומטי מיידי בכל שעה · נציג בשעות הפעילות",

  /* The shop's own pages on the two networks it actually posts to.
     They are listed here rather than inline in the footer because the footer
     is not their only reader: schema.ts declares them as the Organization's
     sameAs, which is how Google ties this domain, the Business Profile and
     those two profiles together into one entity instead of three. A link
     that appears in one place and not the other breaks exactly that match.

     The Facebook address is the vanity one rather than the numeric
     profile.php?id= form: it avoids a redirect and says the page's name out
     loud, which is what a shared link shows and what sameAs is read for.

     Confirmed by a person opening it, which is the only check that counts
     here. From this network Facebook answers 400 to the vanity URL, to the
     numeric one, and to a page invented to be certain it does not exist,
     while PREC's page answers 200 — so a request from a server cannot tell
     a live page from a dead one, and a dead link in sameAs is worse than a
     stale one. */
  instagram: "https://www.instagram.com/buytoday.co.il/",
  facebook: "https://www.facebook.com/buytoday.co.il",
  /* Declared alongside the other two rather than instead of them. Verified
     to answer 200 before being written here, which is the rule for anything
     that goes into sameAs: a dead link there is worse than a missing one,
     because it is the field Google uses to decide that this domain and that
     profile are one business. */
  threads: "https://www.threads.net/@buytoday.co.il",

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
