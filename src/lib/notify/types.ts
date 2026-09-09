/**
 * What the shop tells a customer, and how.
 *
 * Four moments, chosen because each one changes what the customer should do
 * next. A message that does not change anything is a message that teaches
 * people to ignore the sender, and a shop only gets to spend that once.
 */
export const NOTIFY_EVENTS = [
  "ORDER_RECEIVED",
  "PAYMENT_APPROVED",
  "SHIPPED",
  "DELIVERED",
] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

export const NOTIFY_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

export const NOTIFY_CHANNEL_LABELS: Record<NotifyChannel, string> = {
  EMAIL: "מייל",
  SMS: "SMS",
  WHATSAPP: "וואטסאפ",
};

export const NOTIFY_EVENT_LABELS: Record<NotifyEvent, string> = {
  ORDER_RECEIVED: "ההזמנה התקבלה",
  PAYMENT_APPROVED: "התשלום אושר",
  SHIPPED: "ההזמנה יצאה למשלוח",
  DELIVERED: "ההזמנה נמסרה",
};

/** One message, already rendered. Channels differ in how they send it, not in what it says. */
export type Message = {
  subject: string;
  /** Plain text. SMS and WhatsApp send this as-is; email wraps it. */
  body: string;
};

export type SendResult = { ok: true } | { ok: false; error: string };

/**
 * A way of reaching somebody.
 *
 * `configured()` is separate from `send()` on purpose. A shop with no SMS
 * account is not a shop whose SMS failed — it is one that never offered SMS,
 * and the two have to look different in the log or every order grows a row
 * of red that means nothing and hides the one that does.
 */
export type Channel = {
  id: NotifyChannel;
  configured(): boolean;
  /** What is missing, for the admin screen. Empty when configured. */
  missing(): string[];
  send(to: string, message: Message): Promise<SendResult>;
};
