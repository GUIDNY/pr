import { z } from "zod";

// SQLite has no native enum type, so these are the single source of truth
// for every "enum-like" string column in prisma/schema.prisma. Moving to
// Postgres later means turning these into real `enum` blocks in the schema;
// the values below would stay identical.

export const ORDER_STATUSES = [
  "NEW",
  "PAYMENT_PENDING",
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
};

export const INVENTORY_ALERT_SEVERITIES = ["INFO", "WARNING", "CRITICAL"] as const;
export type InventoryAlertSeverity = (typeof INVENTORY_ALERT_SEVERITIES)[number];

export const SYNC_RUN_STATUSES = ["RUNNING", "SUCCESS", "FAILED", "NO_CHANGES"] as const;
export type SyncRunStatus = (typeof SYNC_RUN_STATUSES)[number];

export const SYNC_RUN_STATUS_LABELS: Record<SyncRunStatus, string> = {
  RUNNING: "מסנכרן...",
  SUCCESS: "הסתיים בהצלחה",
  FAILED: "נכשל",
  NO_CHANGES: "לא נמצאו שינויים",
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

export const USER_ROLES = ["CUSTOMER", "ADMIN", "STAFF"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const DELIVERY_METHODS = ["DELIVERY", "PICKUP"] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const DELIVERY_METHOD_LABELS: Record<DeliveryMethod, string> = {
  DELIVERY: "משלוח עד הבית",
  PICKUP: "איסוף עצמי מהסניף",
};

export const PROMOTION_TYPES = ["PERCENTAGE", "FIXED"] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

export const PROMOTION_SCOPES = ["CART", "CATEGORY", "BRAND", "PRODUCT"] as const;
export type PromotionScope = (typeof PROMOTION_SCOPES)[number];

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
