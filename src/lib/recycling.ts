import type { DeliveryMethod } from "@/lib/delivery";

/**
 * Taking the old appliance away.
 *
 * Israeli law (החוק לטיפול סביבתי בציוד חשמלי ואלקטרוני ובסוללות) gives
 * somebody buying a new appliance the right to hand over an old one of the
 * same kind, free, when the new one is delivered. Same kind, not same brand,
 * same importer, same model or same size: a 600-litre fridge buys the removal
 * of a 300-litre one.
 *
 * WHAT THIS FILE IS AND IS NOT. It holds the rules and the wording — which
 * delivery method needs a phone call first, what the customer is asked to
 * confirm, how the sentence on the checkbox is built. It holds no mapping
 * from catalogue category to equipment group: that lives in the database,
 * because the shop has to be able to add a category next month without a
 * deploy, and because the one thing this feature must never do is guess.
 *
 * NO GUESSING, and it is worth being plain about why. If the site offers to
 * take away "an old television" when somebody buys a TV stand, the carrier
 * arrives with no room on the van, or takes it and the shop has no lawful
 * route to dispose of it. Both are worse than not offering. So an unmapped
 * category offers nothing at all, silently, and the admin screen lists what
 * is unmapped so a person can decide. A blank is a question, not a bug.
 *
 * No server imports, on purpose — the checkout is a client component and the
 * sentence it prints has to be the same sentence the confirmation email and
 * the back office print.
 */

/**
 * WHETHER A CUSTOMER MAY ACTUALLY ORDER A REMOVAL YET.
 *
 * This is the one switch in the feature and it is off. Everything a customer
 * reads is live — the product page says the right exists, /old-product-removal
 * explains it in full, the checkout says it out loud next to the basket — but
 * the checkbox that records a request is not rendered, and in its place the
 * checkout gives the shop's phone number.
 *
 * Off because of the five things that have to be true before a tick in a box
 * means an old fridge actually leaves a flat, and none of them are code:
 *
 *   1. who collects the old appliance, for each delivery method
 *   2. that they are given the removal data before the van is loaded
 *   3. what happens to a product shipped straight from a supplier or importer
 *   4. what happens when the new one goes to a collection point, not a door
 *   5. that the shop has an arrangement with a recognised recycling
 *      corporation for the waste that comes back
 *
 * A request recorded before those exist is the failure this whole feature was
 * asked to prevent: the customer ticked the box on the website and the driver
 * never heard about it. An honest phone number is better than a tick nobody
 * reads.
 *
 * TO TURN IT ON: change this to true and push. That is the whole procedure —
 * a push builds and publishes by itself, and there is nothing to press in the
 * Vercel dashboard (pressing Redeploy there republishes the commit that is
 * already live, which would put the site back to before this line changed).
 * It is a constant rather than an environment variable for exactly that
 * reason: an env var would need a redeploy to take effect, and the redeploy
 * button is the trap.
 */
export const REMOVAL_ORDERING_ENABLED = false;

/** What the shop needs from the customer for the removal to be free. Rendered
    wherever a removal is offered or confirmed — the checkout, the receipt,
    the standing page — from this one list, because a condition stated in one
    place and not another is a condition that cannot be relied on. */
export const REMOVAL_PREPARATION: readonly string[] = [
  "ריק ממזון, ממים, מקרח, מכביסה ומכל דבר שאינו חלק מהמכשיר",
  "מנותק מראש מחשמל",
  "מנותק ממים",
  "מנותק מגז",
  "מנותק מרהיטים ומכל חיבור קבוע או זמני",
  "נגיש לפינוי מהמקום הסביר שבו הוא נמצא",
  "שלם, ולא מפורק לחלקים מהותיים",
];

/** The one sentence under every preparation list. The courier is a courier. */
export const REMOVAL_NOT_A_TRADESMAN =
  "המוביל אינו מבצע עבודות חשמל, גז, מים, נגרות או פירוק תשתיות. מייבש שמונח על מכונת כביסה יש להוריד מראש.";

/** What the customer ticks to say they have read the paragraph above. Stored
    on the order line, because the free removal rests on this being true and
    "we showed them the text" is not the same as "they agreed to it". */
export const REMOVAL_ACKNOWLEDGEMENT =
  "אני מאשר שהמוצר הישן יהיה ריק, מנותק ונגיש לפינוי בהתאם לתנאים.";

/** The short line that goes under the checkbox, and under the notice on the
    product page. */
export const REMOVAL_FREE_NOTE =
  "הפינוי ללא עלות בהתאם לחוק ובכפוף לתנאי הפינוי. פינוי חריג עשוי להיות כרוך בתשלום.";

/** Where the full terms live. One address, used by every link. */
export const REMOVAL_PAGE_PATH = "/old-product-removal";

/**
 * An equipment group, as everything outside the database needs it.
 *
 * Deliberately not the Prisma row: the checkout is a client component and
 * cannot be handed a model object, and a snapshot on an old order item has
 * the same shape as a live category without being one.
 */
export type RemovalGroup = {
  key: string;
  /** "מקרר" — the noun on its own. */
  label: string;
  /** "מקרר ישן" — the whole phrase, already agreeing in gender and number. */
  oldLabel: string;
  isLargeAppliance: boolean;
  asksExceptional: boolean;
  exceptionalFee: number | null;
};

/** "אני מעוניין בפינוי מקרר ישן בעת אספקת המוצר החדש" — the checkbox, in the
    words of the thing actually being bought. Never a generic "פינוי מוצר":
    a customer who reads that has to work out what they are agreeing to. */
export function removalRequestLabel(group: Pick<RemovalGroup, "oldLabel">, method: DeliveryMethod): string {
  return method === "PICKUP"
    ? `אני מעוניין למסור ${group.oldLabel} בעת האיסוף`
    : `אני מעוניין בפינוי ${group.oldLabel} בעת אספקת המוצר החדש`;
}

/** The example sentence on the product page: "ברכישת מקרר ניתן למסור מקרר ישן,
    גם אם הוא בגודל או ממותג שונים." */
export function removalExampleLine(group: Pick<RemovalGroup, "label" | "oldLabel">): string {
  return `ברכישת ${group.label} ניתן למסור ${group.oldLabel}, גם אם הוא בגודל או ממותג שונים.`;
}

/**
 * Whether to put the access questions in front of this customer.
 *
 * Two conditions, and the second is the one that is easy to miss: somebody
 * collecting from the counter in Hadera is carrying the old appliance to us.
 * Asking them how many flights of stairs there are is asking about a journey
 * the shop is not making, and every answer would be noise on the order.
 */
export function asksExceptionalQuestions(group: RemovalGroup, method: DeliveryMethod): boolean {
  return group.asksExceptional && method !== "PICKUP";
}

/**
 * What a removal on this order starts life as.
 *
 * REQUESTED means it can go ahead as ordinary free removal. NEEDS_COORDINATION
 * means somebody rings the customer before the carrier is booked, and the
 * customer is told so rather than being left to expect a free collection.
 *
 * Three ways to land in coordination:
 *
 *   the access questions were answered yes — it may be chargeable, and the
 *   law says the customer has to know the price before it happens;
 *
 *   the new appliance is going to a collection point — the courier who drops
 *   a parcel at a shop counter is not collecting a fridge from a flat, and
 *   pretending otherwise on the checkout is a promise the shop cannot keep;
 *
 *   there is no carrier arrangement yet for this lane, which is what
 *   REMOVAL_ORDERING_ENABLED above is about — that case never reaches here,
 *   because the checkbox is not rendered at all.
 */
export function initialRemovalStatus(
  method: DeliveryMethod,
  exceptional: boolean,
): "REQUESTED" | "NEEDS_COORDINATION" {
  if (exceptional) return "NEEDS_COORDINATION";
  if (method === "PICKUP_POINT") return "NEEDS_COORDINATION";
  return "REQUESTED";
}

/** What the customer is told about when and how it happens, for the method
    they chose. Said at the checkout and repeated on the receipt. */
export function removalTimingNote(method: DeliveryMethod): string {
  switch (method) {
    case "DELIVERY":
      return "הפינוי מתבצע בעת אספקת המוצר החדש. אין צורך לתאם ביקור נפרד.";
    case "PICKUP_POINT":
      return "המוצר החדש נמסר בנקודת איסוף ולא בבית, ולכן מסירת המוצר הישן תתבצע בדרך חלופית בהתאם להסדר הפינוי של Buy Today. ניצור איתכם קשר לתיאום.";
    case "PICKUP":
      return "ניתן למסור את המוצר הישן בעת האיסוף מהחנות בחדרה.";
  }
}

/** The line a receipt prints for the cost. Never "₪0" and never "חינם" on a
    removal that is going to coordination — that is the number the customer
    would hold the shop to. */
export function removalCostLine(status: string, fee: number | null): string {
  if (fee && fee > 0) return `בתשלום — ${fee} ש"ח`;
  if (status === "NEEDS_COORDINATION") return "דורש תיאום פינוי חריג";
  return "ללא עלות";
}

/** The stored row, as any of the three places that hold one shape it: the
    category's mapping, the product's override, and the admin's editor. */
export type RecyclingRow = {
  key: string;
  label: string;
  oldLabel: string;
  isLargeAppliance: boolean;
  asksExceptional: boolean;
  exceptionalFee: number | null;
  isEnabled: boolean;
};

/**
 * Which old appliance this product entitles its buyer to hand over, if any.
 *
 * One function, called from the cart, the product page, the checkout and the
 * order that gets written — because the answer has to be the same in all
 * four, and the one that must not differ is the last: the sentence the
 * customer agreed to is what the carrier is told to collect.
 *
 * The order of preference is product, then category, and a product override
 * wins even when the category has an answer. That is the whole point of it:
 * the supplier's sheet maps an entire tab to one broad category, so a
 * microwave filed under "מוצרי חשמל למטבח" is not an unusual case, it is
 * dozens of rows.
 *
 * Null in three situations, all of them deliberate silence rather than a
 * failure: nothing is mapped, the product was opted out by hand, or the group
 * it maps to has been switched off. In every one of them the customer is
 * shown no removal offer at all, which is the safe direction — see the header.
 */
export function resolveRemovalGroup(product: {
  recyclingOptOut: boolean;
  recyclingCategory: RecyclingRow | null;
  category: { recyclingCategory: RecyclingRow | null } | null;
}): RemovalGroup | null {
  if (product.recyclingOptOut) return null;
  const row = product.recyclingCategory ?? product.category?.recyclingCategory ?? null;
  if (!row || !row.isEnabled) return null;
  return {
    key: row.key,
    label: row.label,
    oldLabel: row.oldLabel,
    isLargeAppliance: row.isLargeAppliance,
    asksExceptional: row.asksExceptional,
    exceptionalFee: row.exceptionalFee,
  };
}

/** The fields a query has to select for resolveRemovalGroup to be able to
    answer. Exported so the four callers cannot each remember a different
    subset — a missing `isEnabled` here would silently offer a switched-off
    group, and it would only ever be noticed by a customer. */
export const RECYCLING_ROW_SELECT = {
  key: true,
  label: true,
  oldLabel: true,
  isLargeAppliance: true,
  asksExceptional: true,
  exceptionalFee: true,
  isEnabled: true,
} as const;

/** The equipment group as a carrier's system wants to read it: "refrigerator"
    becomes "Refrigerator", "washing_machine" becomes "Washing Machine". The
    key is already the English name, which is why it was chosen in English —
    it is the one field of this feature that leaves the building. */
export function removalTypeForCarrier(key: string): string {
  return key
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * What gets handed to the carrier, as text somebody can paste.
 *
 * THE POINT OF IT. The brief is unambiguous: there must be no situation where
 * the customer ticked the box on the website and the driver never heard about
 * it. There is no API into צ'יטה here — a removal reaches them inside the
 * booking a person makes, the same way a delivery does. So what the software
 * can honestly do is put the exact words in one place, at the moment the
 * booking is made, and then record that it went; the admin marks the order
 * handed off, and until it does the order carries a warning.
 *
 * English keywords and Hebrew detail on purpose. OLD PRODUCT REMOVAL and
 * EXCEPTIONAL are what a dispatcher scans for and what an integration would
 * key on later; the address and the note are for the person driving.
 */
export function removalHandoffText(input: {
  orderNumber: string;
  customerName: string;
  phone: string | null;
  address: string | null;
  methodLabel: string;
  lines: {
    key: string;
    label: string;
    productTitle: string;
    exceptional: boolean;
    reasonLabels: string[];
    notes: string | null;
  }[];
}): string {
  const out: string[] = [
    `OLD PRODUCT REMOVAL: YES`,
    `הזמנה: ${input.orderNumber}`,
    `לקוח: ${input.customerName}${input.phone ? ` · ${input.phone}` : ""}`,
    `אופן אספקה: ${input.methodLabel}`,
  ];
  if (input.address) out.push(`כתובת: ${input.address}`);
  out.push("");

  for (const line of input.lines) {
    out.push(`TYPE: ${removalTypeForCarrier(line.key)} (${line.label})`);
    out.push(`נרכש: ${line.productTitle}`);
    out.push(`EXCEPTIONAL: ${line.exceptional ? "YES" : "NO"}`);
    if (line.reasonLabels.length > 0) out.push(`  ${line.reasonLabels.join(" · ")}`);
    if (line.notes) out.push(`הערת לקוח: ${line.notes}`);
    out.push("");
  }

  out.push("הלקוח אישר שהמוצר הישן יהיה ריק, מנותק ונגיש לפינוי.");
  return out.join("\n");
}

/**
 * One requested removal, as every back-office screen needs it.
 *
 * Shaped here rather than in the panel that renders it, because two screens
 * build it from two different queries — the manager's order page and the
 * seller's — and a second copy of this mapping is a second place for the
 * reason labels to be forgotten.
 */
export type RemovalLine = {
  id: string;
  /** The new product this line bought. */
  productTitle: string;
  /** "מקרר" — what the customer was told they could hand over. */
  label: string;
  /** "refrigerator" — what the carrier is told. */
  key: string;
  exceptional: boolean;
  reasonLabels: string[];
  notes: string | null;
  acknowledged: boolean;
  fee: number | null;
  status: string;
  handedOffAt: string | null;
};

/** The ticked access questions, as stored. Defensive rather than trusting:
    the column is JSON in a String column, and a row written by hand or by an
    older build must not be able to take an order screen down. */
export function parseRemovalReasons(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

/** The removal lines of an order, from the columns as Prisma returns them.
    Takes the label lookup as an argument so this file keeps its promise of
    importing nothing — enums.ts is where the reason wording lives. */
export function toRemovalLines(
  items: {
    id: string;
    titleSnap: string;
    recyclingKeySnap: string | null;
    recyclingLabelSnap: string | null;
    removalRequested: boolean;
    removalExceptional: boolean;
    removalReasons: string | null;
    removalNotes: string | null;
    removalAcknowledged: boolean;
    removalFee: number | null;
    removalStatus: string;
    removalHandedOffAt: Date | null;
  }[],
  reasonLabel: (key: string) => string,
): RemovalLine[] {
  return items
    .filter((i) => i.removalRequested)
    .map((i) => ({
      id: i.id,
      productTitle: i.titleSnap,
      label: i.recyclingLabelSnap ?? "מוצר ישן",
      key: i.recyclingKeySnap ?? "unknown",
      exceptional: i.removalExceptional,
      reasonLabels: parseRemovalReasons(i.removalReasons).map(reasonLabel),
      notes: i.removalNotes,
      acknowledged: i.removalAcknowledged,
      fee: i.removalFee,
      status: i.removalStatus,
      handedOffAt: i.removalHandedOffAt?.toISOString() ?? null,
    }));
}
