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

export const STOCK_STATUSES = [
  "IN_STOCK",
  "LOW_STOCK",
  "OUT_OF_STOCK",
  "SPECIAL_ORDER",
  "DISCONTINUED",
] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];
export const stockStatusSchema = z.enum(STOCK_STATUSES);

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "במלאי",
  LOW_STOCK: "מלאי אחרון",
  OUT_OF_STOCK: "אזל מהמלאי",
  SPECIAL_ORDER: "בהזמנה מיוחדת",
  DISCONTINUED: "הופסק",
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
