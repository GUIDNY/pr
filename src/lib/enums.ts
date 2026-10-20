import { z } from "zod";

// SQLite has no native enum type, so these are the single source of truth
// for every "enum-like" string column in prisma/schema.prisma. Moving to
// Postgres later means turning these into real `enum` blocks in the schema;
// the values below would stay identical.

export const ORDER_STATUSES = [
  "NEW",
  "PAYMENT_PENDING",
  "PAYMENT_FAILED",
  "PAID",
  "PROCESSING",
  "AWAITING_SUPPLIER",
  "SUPPLIER_CONFIRMED",
  "READY_FOR_DELIVERY",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "REFUND_PENDING",
  "REFUNDED",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export const orderStatusSchema = z.enum(ORDER_STATUSES);

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  NEW: "הזמנה התקבלה",
  PAYMENT_PENDING: "ממתין לתשלום",
  PAYMENT_FAILED: "התשלום נכשל",
  PAID: "התשלום אושר",
  PROCESSING: "בטיפול",
  AWAITING_SUPPLIER: "ממתין לספק",
  SUPPLIER_CONFIRMED: "אושר על ידי ספק",
  READY_FOR_DELIVERY: "מוכן למשלוח",
  SHIPPED: "יצא למשלוח",
  DELIVERED: "נמסר",
  CANCELLED: "בוטל",
  REFUND_PENDING: "ממתין לזיכוי",
  REFUNDED: "זוכה",
};

// The "happy path" sequence shown on the customer-facing tracking timeline.
// Terminal/exception statuses (CANCELLED, REFUND_PENDING, REFUNDED) are
// rendered separately rather than as a step in this line.
export const ORDER_TIMELINE_STEPS: OrderStatus[] = [
  "NEW",
  "PAID",
  "PROCESSING",
  "AWAITING_SUPPLIER",
  "READY_FOR_DELIVERY",
  "SHIPPED",
  "DELIVERED",
];

export const ORDER_STATUS_COLORS: Record<OrderStatus, string> = {
  NEW: "bg-muted text-muted-foreground",
  PAYMENT_PENDING: "bg-warning/15 text-warning-foreground",
  PAYMENT_FAILED: "bg-destructive/15 text-destructive",
  PAID: "bg-success/15 text-success",
  PROCESSING: "bg-accent text-accent-foreground",
  AWAITING_SUPPLIER: "bg-warning/15 text-warning-foreground",
  SUPPLIER_CONFIRMED: "bg-accent text-accent-foreground",
  READY_FOR_DELIVERY: "bg-accent text-accent-foreground",
  SHIPPED: "bg-brand/15 text-brand",
  DELIVERED: "bg-success/15 text-success",
  CANCELLED: "bg-destructive/15 text-destructive",
  REFUND_PENDING: "bg-warning/15 text-warning-foreground",
  REFUNDED: "bg-destructive/15 text-destructive",
};

export const PAYMENT_STATUSES = [
  "PENDING",
  "AUTHORIZED",
  "CAPTURED",
  "FAILED",
  "REFUNDED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  PENDING: "ממתין לתשלום",
  AUTHORIZED: "מאושר (טרם נגבה)",
  CAPTURED: "שולם",
  FAILED: "נכשל",
  REFUNDED: "זוכה",
};

/**
 * How an order was paid when it was not paid through the gateway: the
 * salesperson took the card over the phone, the customer transferred, sent
 * a bit, or paid cash at the counter. Chosen on the "שולם ידנית" button and
 * stored in Order.paymentMethod beside the gateway's own value.
 */
export const MANUAL_PAYMENT_METHODS = ["PHONE_CARD", "BANK_TRANSFER", "BIT", "CASH"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];
export const manualPaymentMethodSchema = z.enum(MANUAL_PAYMENT_METHODS);

export const MANUAL_PAYMENT_METHOD_LABELS: Record<ManualPaymentMethod, string> = {
  PHONE_CARD: "אשראי טלפוני",
  BANK_TRANSFER: "העברה בנקאית",
  BIT: "ביט",
  CASH: "מזומן",
};

/** Every value Order.paymentMethod has carried, in Hebrew. The back office
    printed the raw column — "PELECARD" on a Hebrew screen. */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  PELECARD: "כרטיס אשראי",
  DEMO_CARD: "דמו",
  CASH_ON_DELIVERY: "מזומן באספקה",
  ...MANUAL_PAYMENT_METHOD_LABELS,
};
export function paymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  PENDING: "bg-warning/15 text-warning-foreground",
  AUTHORIZED: "bg-accent text-accent-foreground",
  CAPTURED: "bg-success/15 text-success",
  FAILED: "bg-destructive/15 text-destructive",
  REFUNDED: "bg-destructive/15 text-destructive",
};

// An order that has reached one of these is finished; nothing is waiting on
// anyone, so it is never counted as stuck no matter how old it is.
export const CLOSED_ORDER_STATUSES: OrderStatus[] = ["DELIVERED", "CANCELLED", "REFUNDED"];

// Cancelling or refunding is not an ordinary step forward, and a
// mis-click on a row should not be able to do it in silence.
export const DESTRUCTIVE_ORDER_STATUSES: OrderStatus[] = ["CANCELLED", "REFUND_PENDING", "REFUNDED"];

/**
 * The single next step for an order on the ordinary path, which is what an
 * order needs 90% of the time — so it can be one button rather than a hunt
 * through a twelve-item dropdown. Null means the order is finished, or sits
 * somewhere the shop has to make a real decision about.
 */
export const NEXT_ORDER_STATUS: Record<OrderStatus, OrderStatus | null> = {
  NEW: "PAID",
  PAYMENT_PENDING: "PAID",
  // No default step: a failed payment is a decision — chase the customer, take
  // it on delivery, or cancel — not something to advance with one click.
  PAYMENT_FAILED: null,
  PAID: "PROCESSING",
  PROCESSING: "AWAITING_SUPPLIER",
  AWAITING_SUPPLIER: "SUPPLIER_CONFIRMED",
  SUPPLIER_CONFIRMED: "READY_FOR_DELIVERY",
  READY_FOR_DELIVERY: "SHIPPED",
  SHIPPED: "DELIVERED",
  DELIVERED: null,
  CANCELLED: null,
  REFUND_PENDING: "REFUNDED",
  REFUNDED: null,
};

/**
 * How long an order may sit in a status before the list flags it. These are
 * the shop's own service expectations, not arbitrary: a paid order nobody has
 * started on is urgent within hours, while an order already with the supplier
 * is expected to wait days.
 */
export const ORDER_STALE_AFTER_HOURS: Record<OrderStatus, number | null> = {
  NEW: 24,
  PAYMENT_PENDING: 48,
  // A customer whose card was declined is still trying to buy something. Half
  // a day is already long to leave that without a phone call.
  PAYMENT_FAILED: 12,
  PAID: 24,
  PROCESSING: 48,
  AWAITING_SUPPLIER: 120,
  SUPPLIER_CONFIRMED: 72,
  READY_FOR_DELIVERY: 48,
  SHIPPED: 168,
  DELIVERED: null,
  CANCELLED: null,
  REFUND_PENDING: 72,
  REFUNDED: null,
};

export const STOCK_STATUSES = [
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "SPECIAL_ORDER",
  "DISCONTINUED",
  "SUPPLIER_STOCK", // sellable only from bonded/supplier stock, not on-hand
  "DISPLAY_ONLY", // showroom unit only, not sellable
  "NEEDS_REVIEW", // inventory data is inconsistent/unmatched — needs a human look
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export const stockStatusSchema = z.enum(STOCK_STATUSES);

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "במלאי",
  LOW_STOCK: "מלאי אחרון",
  OUT_OF_STOCK: "אזל מהמלאי",
  SPECIAL_ORDER: "בהזמנה מיוחדת",
  DISCONTINUED: "הופסק",
  SUPPLIER_STOCK: "מלאי ספק",
  DISPLAY_ONLY: "תצוגה בלבד",
  NEEDS_REVIEW: "דורש בדיקה",
};

export const STOCK_STATUS_COLORS: Record<StockStatus, string> = {
  IN_STOCK: "bg-success/15 text-success",
  LOW_STOCK: "bg-warning/15 text-warning-foreground",
  OUT_OF_STOCK: "bg-destructive/15 text-destructive",
  SPECIAL_ORDER: "bg-accent text-accent-foreground",
  DISCONTINUED: "bg-muted text-muted-foreground",
  SUPPLIER_STOCK: "bg-accent text-accent-foreground",
  DISPLAY_ONLY: "bg-muted text-muted-foreground",
  NEEDS_REVIEW: "bg-destructive/15 text-destructive",
};

// ---------- Inventory sync (Excel/ERP source of truth) ----------

export const INVENTORY_CHANGE_TYPES = [
  "PRICE_CHANGED",
  "STOCK_INCREASED",
  "STOCK_DECREASED",
  "BECAME_OUT_OF_STOCK",
  "BACK_IN_STOCK",
  "NEW_PRODUCT",
  "PRODUCT_MISSING_FROM_SOURCE",
  "SUPPLIER_STOCK_CHANGED",
  "SHOWROOM_STOCK_CHANGED",
  "PRODUCT_DATA_CHANGED",
  "SOURCE_CONFLICT",
] as const;
export type InventoryChangeType = (typeof INVENTORY_CHANGE_TYPES)[number];

export const INVENTORY_CHANGE_TYPE_LABELS: Record<InventoryChangeType, string> = {
  PRICE_CHANGED: "מחיר השתנה",
  STOCK_INCREASED: "מלאי גדל",
  STOCK_DECREASED: "מלאי קטן",
  BECAME_OUT_OF_STOCK: "אזל מהמלאי",
  BACK_IN_STOCK: "חזר למלאי",
  NEW_PRODUCT: "מוצר חדש",
  PRODUCT_MISSING_FROM_SOURCE: "נעלם מהמקור",
  SUPPLIER_STOCK_CHANGED: "מלאי ספק השתנה",
  SHOWROOM_STOCK_CHANGED: "מלאי תצוגה השתנה",
  PRODUCT_DATA_CHANGED: "פרטי מוצר השתנו",
  SOURCE_CONFLICT: "התנגשות בין מקורות",
};

export const INVENTORY_ALERT_TYPES = [
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "UNMATCHED_ROW",
  "DUPLICATE_SKU",
  "DUPLICATE_MODEL",
  "INVALID_PRICE",
  "MISSING_MODEL",
  "UNKNOWN_COLUMN",
  "NEGATIVE_STOCK",
  "MAJOR_STOCK_CHANGE",
  "MISSING_FROM_SOURCE",
  "SOURCE_CONFLICT",
  "URGENT_MISSING_MEDIA",
  "MISSING_IMAGE",
  "NEW_FROM_SOURCE",
  "MANUAL_ATTENTION",
  "MANUAL_URGENT",
  /* Not a fact about a product or a row — a fact about the sync itself not
     having happened. Every other type here is written *by* a sync run,
     which is exactly why none of them fired when the price sheets stopped
     arriving on 23 September: the upload died before the run started, so
     there was no run to report anything, and four days of stale stock
     looked identical to four quiet days. This is the one alert raised from
     outside. See inventory/sync-watchdog.ts. */
  "SYNC_STALE",
  /* The shop is selling below what the supplier charges it.
     Distinct from INVALID_PRICE, which is about a price column in the
     sheet looking wrong. This one compares the price the shop actually
     charges — set once at creation, or by a person since — against the
     cost the sheet reports today. Cost moves; a stored price does not,
     because nothing but a person is allowed to change it. So the two
     drift apart silently, and on 30 September fourteen live products had
     drifted past each other. */
  "PRICE_BELOW_COST",
  /* A whole tab of the price list produced nothing, and the run said
     SUCCESS anyway.
     The one this is named after: on 2026-09-09 four tabs stopped resolving
     to a category, and the only thing that reported it was UNMATCHED_ROW,
     once per row — 3,829 of them a day, in the same alert type as the
     thousands of "this row has no stock data" warnings, with 2,530 already
     auto-resolved. The information was all there and no person could ever
     have found it. It ran for 35 days and ended with a customer on the
     phone about a TV mount that had left the price list in September.
     So: one alert, per tab, CRITICAL, naming the tab and what it cost. A
     fault that takes out a whole category of the shop is not the same kind
     of thing as a row with a blank column, and it must not be reported in
     the same breath. */
  "SHEET_NOT_MAPPED",
  "ROW_CLAIMED_TWICE",
  /* A tab that does map, and is being read, but has not moved a product in
     days. Raised from outside the sync by sync-watchdog.ts, for the same
     reason SYNC_STALE is: a tab that silently stops producing updates
     cannot be noticed by the run that is failing to produce them. The
     file-level check could not see this — the workbook changed every day
     because 26 other tabs changed. */
  "SHEET_STALE",
  /* A sync replaced a product with a blank record on the same sheet row.
     The 12 October 04:30 run did it fourteen times: it marked fourteen
     enriched, photographed, published products as gone from the price list
     and created an empty one for each, on the same tab, the same row index
     and the same content hash. 93,130 ₪ of stock stopped being for sale and
     the run reported SUCCESS, 15 added, 15 missing — two numbers that look
     like a healthy morning. Nothing in the back office said otherwise, and
     it was found five hours later only because the owner asked a question
     about something else.
     The cause is fixed (see rowStillNamesThisProduct), so this is not a
     report of that bug: it is the check that would have caught it in one
     minute, and will catch the next thing that does the same damage by a
     route nobody has thought of. Raised from the watchdog's own cron, not
     from inside a run, for the reason SYNC_STALE and SHEET_STALE are — a
     run that is doing damage is not a reliable narrator of the damage. */
  "PRODUCT_REPLACED_BY_BLANK",
  /* The shop got smaller and the price list does not explain it.
     The only check here that does not describe a shape. Every other type
     was written after a particular failure and catches that failure; none
     of them would have caught the others. This one samples how many
     products a customer can buy, every three hours, and speaks when the
     number falls further than stock running out accounts for — so whatever
     breaks the catalogue next is reported before anybody has worked out
     what it was. */
  /* The row this product is bound to describes a different appliance.
     A row with a real SKU was always believed outright — the SKU is the
     supplier's own key and the identity signal the whole import rests on.
     On 12 October a customer was shown a Samsung RT53DG7A14WW, a 530-litre
     top-freezer, at 6,200 ₪: the price list had given SKU 107012 to a
     RF60C7012SL instead, a 660-litre four-door, and the sync took that
     row's price without hesitating because the SKU matched. The real
     record for the fridge, holding the row whose model actually says
     RT53DG7A14WW, was sitting hidden at 3,600 ₪. The shop was asking
     2,600 ₪ too much for a week.
     Raised when the model a real-SKU row prints *changes* into one that
     contradicts the product — which is the moment a SKU is reassigned, and
     the only moment the two cases can be told apart. An enrichment
     correction moves the product's model and leaves the row alone; a
     reassignment moves the row. While the alert is open the price and the
     cost of that row are not adopted. */
  "ROW_NAMES_ANOTHER_MODEL",
  /* The product's own title prints a model code its model field does not
     know. Not about the price list at all — the row is fine and the two
     halves of our own record disagree, which is how a page titled
     "Samsung Crystal UHD 65U8000H" came to be an LG OLED evo 77" at
     10,500 ₪ while the real Samsung sold elsewhere at 2,400. The price on
     it was right the whole time; the name was not.
     It reports the pair and does not pick a side: often the title and the
     price-list row agree and the model field is the stale one. Settling
     that needs the manufacturer, so a person does it. */
  "TITLE_NAMES_ANOTHER_MODEL",
  "CATALOG_SHRANK",
] as const;
export type InventoryAlertType = (typeof INVENTORY_ALERT_TYPES)[number];

export const INVENTORY_ALERT_TYPE_LABELS: Record<InventoryAlertType, string> = {
  LOW_STOCK: "מלאי נמוך",
  OUT_OF_STOCK: "אזל מהמלאי",
  UNMATCHED_ROW: "שורה שלא זוהתה",
  DUPLICATE_SKU: "מק\"ט כפול",
  DUPLICATE_MODEL: "דגם כפול",
  INVALID_PRICE: "מחיר לא תקין",
  MISSING_MODEL: "חסר דגם",
  UNKNOWN_COLUMN: "עמודה לא מזוהה",
  NEGATIVE_STOCK: "מלאי שלילי",
  MAJOR_STOCK_CHANGE: "שינוי מלאי חריג",
  MISSING_FROM_SOURCE: "נעלם מהמקור",
  SOURCE_CONFLICT: "התנגשות בין מקורות",
  URGENT_MISSING_MEDIA: "אין תמונה ואין מפרט טכני",
  MISSING_IMAGE: "חסרה תמונה",
  NEW_FROM_SOURCE: "מוצר חדש מהגיליון",
  MANUAL_ATTENTION: "סומן לטיפול ידנית",
  MANUAL_URGENT: "סומן לטיפול דחוף ידנית",
  SYNC_STALE: "הסנכרון לא רץ",
  PRICE_BELOW_COST: "מחיר מתחת לעלות הספק",
  SHEET_NOT_MAPPED: "לשונית במחירון לא זוהתה",
  ROW_CLAIMED_TWICE: "שורה אחת במחירון נתבעת על ידי כמה מוצרים",
  SHEET_STALE: "לשונית לא מתעדכנת",
  PRODUCT_REPLACED_BY_BLANK: "מוצר יצא מהאתר ורשומה ריקה נכנסה במקומו",
  CATALOG_SHRANK: "מספר המוצרים באתר ירד",
  ROW_NAMES_ANOTHER_MODEL: "השורה מדפיסה דגם של מוצר אחר",
  TITLE_NAMES_ANOTHER_MODEL: "הכותרת מדפיסה דגם אחר משדה הדגם",
};

export const INVENTORY_ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type InventoryAlertSeverity = (typeof INVENTORY_ALERT_SEVERITIES)[number];

// SKIPPED is the one that is not an outcome of reading the sheets: it means
// another run was already in flight and this one stood down. It exists so
// that "nothing was imported" and "nothing had changed" stop looking alike
// in the history, which is the difference between a quiet day and a sync
// that has been refusing to start for a week.
export const SYNC_RUN_STATUSES = ["RUNNING", "SUCCESS", "FAILED", "NO_CHANGES", "SKIPPED"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export const SYNC_RUN_STATUS_LABELS: Record<SyncRunStatus, string> = {
  RUNNING: "מסנכרן...",
  SUCCESS: "הסתיים בהצלחה",
  FAILED: "נכשל",
  NO_CHANGES: "לא נמצאו שינויים",
  SKIPPED: "דולג — סנכרון אחר רץ",
};

export const SYNC_TRIGGERS = ["MANUAL", "SCHEDULED"] as const;
export type SyncTrigger = (typeof SYNC_TRIGGERS)[number];

export const ENRICHMENT_STATUSES = ["NOT_ENRICHED", "ENRICHED", "NEEDS_REVIEW"] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const ENRICHMENT_STATUS_LABELS: Record<EnrichmentStatus, string> = {
  NOT_ENRICHED: "טרם הועשר",
  ENRICHED: "הועשר",
  NEEDS_REVIEW: "דורש בדיקה",
};

// What the price list says about whether a product can still be got, which is
// a different question from how many units a warehouse holds. The owner's rule
// of 19 October: everything in the list is sellable — no stock means someone
// rings the supplier — **unless** the row is marked gone, and then stock on
// hand is the limit. Only ORDERABLE sells without stock; see
// inventory/availability.ts, which reads these off the row, and
// sellableWithoutStock(), which is the single place the rule is encoded.
//
// The three non-orderable values say different things to a person even though
// they share one selling rule, so they are not collapsed: "the supplier is
// out", "out of production" and "expected back" lead to different decisions in
// the back office.
export const SOURCE_AVAILABILITIES = [
  "ORDERABLE",
  "STOCK_ONLY",
  "END_OF_LINE",
  "TEMPORARILY_OUT",
] as const;
export type SourceAvailability = (typeof SOURCE_AVAILABILITIES)[number];
export const sourceAvailabilitySchema = z.enum(SOURCE_AVAILABILITIES);

export const SOURCE_AVAILABILITY_LABELS: Record<SourceAvailability, string> = {
  ORDERABLE: "זמין להזמנה",
  STOCK_ONLY: "אזל אצל הספק — מלאי בלבד",
  END_OF_LINE: "סוף דגם",
  TEMPORARILY_OUT: "אזל זמנית",
};

// Which importer a unit came through. A parallel-import unit may be listed and
// sold like any other as long as the page says so — the owner's instruction —
// and its warranty is the importer's rather than the manufacturer's. The
// marker is written inside the price list's brand cell; see
// inventory/import-channel.ts.
export const IMPORT_CHANNELS = ["OFFICIAL", "PARALLEL"] as const;
export type ImportChannel = (typeof IMPORT_CHANNELS)[number];
export const importChannelSchema = z.enum(IMPORT_CHANNELS);

export const IMPORT_CHANNEL_LABELS: Record<ImportChannel, string> = {
  OFFICIAL: "יבואן רשמי",
  PARALLEL: "יבוא מקביל",
};

// SELLER is the back office without the shop attached to it: orders, and
// nothing else. ADMIN and STAFF are still the same thing as each other and
// see everything — see lib/permissions.ts, which is the only place that
// decides what a role may reach.
export const USER_ROLES = ["CUSTOMER", "ADMIN", "STAFF", "SELLER"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const DELIVERY_METHODS = ["DELIVERY", "PICKUP_POINT", "PICKUP"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  DELIVERY: "משלוח עד הבית",
  PICKUP_POINT: "איסוף מנקודת איסוף",
  PICKUP: "איסוף עצמי מהסניף",
};

export const PROMOTION_TYPES = ["PERCENTAGE", "FIXED", "FREE_DELIVERY"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_TYPE_LABELS: Record<PromotionType, string> = {
  PERCENTAGE: "אחוז הנחה",
  FIXED: "סכום הנחה",
  FREE_DELIVERY: "משלוח חינם",
};

export const PROMOTION_SCOPES = ["CART", "CATEGORY", "BRAND", "PRODUCT"] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

export const PROMOTION_SCOPE_LABELS: Record<PromotionScope, string> = {
  CART: "כל העגלה",
  CATEGORY: "קטגוריה",
  BRAND: "מותג",
  PRODUCT: "מוצר",
};

export const SUPPORT_CHANNELS = ["CALLBACK", "WHATSAPP", "PHONE", "FORM"] as const;
export type SupportChannel = (typeof SUPPORT_CHANNELS)[number];

export const SUPPORT_CHANNEL_LABELS: Record<SupportChannel, string> = {
  CALLBACK: "שיחה חוזרת",
  WHATSAPP: "וואטסאפ",
  PHONE: "טלפון",
  FORM: "טופס",
};

// The callback workflow on an abandoned checkout (/admin/abandoned). A cart
// carries this only once someone typed contact details into the checkout form
// and then left without completing the order.
export const CART_FOLLOW_UP_STATUSES = ["NEW", "HANDLED", "NOT_RELEVANT"] as const;
export type CartFollowUpStatus = (typeof CART_FOLLOW_UP_STATUSES)[number];
export const cartFollowUpStatusSchema = z.enum(CART_FOLLOW_UP_STATUSES);

export const CART_FOLLOW_UP_STATUS_LABELS: Record<CartFollowUpStatus, string> = {
  NEW: "חדש",
  HANDLED: "טופל",
  NOT_RELEVANT: "לא רלוונטי",
};

export const CART_FOLLOW_UP_STATUS_COLORS: Record<CartFollowUpStatus, string> = {
  NEW: "bg-brand/10 text-brand",
  HANDLED: "bg-success/10 text-success",
  NOT_RELEVANT: "bg-muted text-muted-foreground",
};

// ---------------------------------------------------------------------------
// Complaints (/admin/complaints)
// ---------------------------------------------------------------------------
// A complaint is a WhatsApp conversation the bot could not close on its own,
// kept as a thread so whoever picks it up sees what was already said. The
// whole record is internal: the customer is never told a complaint exists,
// never gets a ticket number, and never sees a word of this. See
// src/app/api/internal/complaints/ingest/route.ts.

export const COMPLAINT_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "RESOLVED", "CLOSED"] as const;
export type ComplaintStatus = (typeof COMPLAINT_STATUSES)[number];
export const complaintStatusSchema = z.enum(COMPLAINT_STATUSES);

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: "פתוחה",
  IN_PROGRESS: "בטיפול",
  WAITING_CUSTOMER: "ממתין ללקוח",
  RESOLVED: "נפתרה",
  CLOSED: "סגורה",
};

export const COMPLAINT_STATUS_COLORS: Record<ComplaintStatus, string> = {
  OPEN: "bg-brand/10 text-brand",
  IN_PROGRESS: "bg-accent text-accent-foreground",
  WAITING_CUSTOMER: "bg-warning/15 text-warning-foreground",
  RESOLVED: "bg-success/10 text-success",
  CLOSED: "bg-muted text-muted-foreground",
};

// A complaint in one of these is finished: a new message from the same
// number opens a fresh one rather than reviving it.
export const CLOSED_COMPLAINT_STATUSES: ComplaintStatus[] = ["RESOLVED", "CLOSED"];

export const COMPLAINT_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ComplaintSeverity = (typeof COMPLAINT_SEVERITIES)[number];
export const complaintSeveritySchema = z.enum(COMPLAINT_SEVERITIES);

export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  LOW: "נמוכה",
  MEDIUM: "בינונית",
  HIGH: "גבוהה",
  CRITICAL: "קריטית",
};

export const COMPLAINT_SEVERITY_COLORS: Record<ComplaintSeverity, string> = {
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-accent text-accent-foreground",
  HIGH: "bg-warning/15 text-warning-foreground",
  CRITICAL: "bg-destructive/10 text-destructive",
};

// Ordered, so "more severe than what is already there" is a comparison and
// not a lookup table. A complaint never becomes less severe on its own.
export const COMPLAINT_SEVERITY_RANK: Record<ComplaintSeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export const COMPLAINT_CATEGORIES = [
  "PRODUCT_DEFECT",
  "DELIVERY_DELAY",
  "DELIVERY_DAMAGE",
  "WRONG_ITEM",
  "MISSING_ITEM",
  "BILLING",
  "WARRANTY",
  "INSTALLATION",
  "SERVICE_QUALITY",
  "RETURN_REFUND",
  "OTHER",
] as const;
export type ComplaintCategory = (typeof COMPLAINT_CATEGORIES)[number];
export const complaintCategorySchema = z.enum(COMPLAINT_CATEGORIES);

export const COMPLAINT_CATEGORY_LABELS: Record<ComplaintCategory, string> = {
  PRODUCT_DEFECT: "מוצר פגום",
  DELIVERY_DELAY: "עיכוב במשלוח",
  DELIVERY_DAMAGE: "נזק במשלוח",
  WRONG_ITEM: "מוצר שגוי",
  MISSING_ITEM: "פריט חסר",
  BILLING: "חיוב",
  WARRANTY: "אחריות",
  INSTALLATION: "התקנה",
  SERVICE_QUALITY: "איכות השירות",
  RETURN_REFUND: "החזרה או זיכוי",
  OTHER: "אחר",
};

// Who said it. SYSTEM is the thread's own bookkeeping ("status changed to
// RESOLVED by ..."), never anything a person typed.
export const COMPLAINT_MESSAGE_ROLES = ["CUSTOMER", "BOT", "STAFF", "SYSTEM"] as const;
export type ComplaintMessageRole = (typeof COMPLAINT_MESSAGE_ROLES)[number];

export const COMPLAINT_MESSAGE_ROLE_LABELS: Record<ComplaintMessageRole, string> = {
  CUSTOMER: "לקוח",
  BOT: "אלפרד",
  STAFF: "נציג",
  SYSTEM: "מערכת",
};

// The closed set of intents the WhatsApp bot returns. Kept here rather than
// in the endpoint because it is a contract with something outside this repo:
// changing it means changing the bot too.
export const BOT_INTENTS = [
  "greeting",
  "product_question",
  "price_question",
  "stock_question",
  "order_status",
  "shipping",
  "warranty",
  "returns",
  "complaint",
  "human_request",
  "payment",
  "technical_support",
  "off_topic",
  "other",
] as const;
export type BotIntent = (typeof BOT_INTENTS)[number];

// Which of them may OPEN a complaint. Two, and deliberately only two.
//
// order_status, returns and warranty were on this list in the first draft
// and came off: "מתי יגיע?" and "מה האחריות?" are questions, and a queue
// that fills with questions is a queue nobody reads — which is the failure
// this whole feature exists to fix, arrived at from the other side.
//
// The bot no longer escalates on its own either. When it recognises a
// grievance it asks the customer whether to open one, and only sends
// needsHuman on a "yes" — except for someone who asked for a person or said
// "תלונה" outright, who goes straight through. So by the time a request
// reaches this endpoint the customer has already agreed, and a second filter
// here would only throw away something they asked for. (Note this does not
// mean the customer knows a *complaint record* exists: they were asked
// whether someone should look into it, which is a different thing, and no
// ticket number or system detail ever reaches them.)
//
// The gate applies only to opening. Once a complaint is open, every later
// message from that number joins it whatever its intent — a "תודה" is part
// of the story, and a thread with the calm parts removed misleads whoever
// reads it.
export const COMPLAINT_OPENING_INTENTS: BotIntent[] = ["complaint", "human_request"];
