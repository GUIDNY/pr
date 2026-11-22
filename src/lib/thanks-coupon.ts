/**
 * The "thank you" coupon the owner sends by hand to a customer who has
 * received their order: 5% off the next purchase, one use, 60 days.
 *
 * It is an ordinary Promotion (lib/pricing.ts resolveCoupon judges it, so the
 * discount is on the products only, never the delivery, and a cart holds one
 * coupon at a time). What makes it personal is the code and the limits:
 * usageLimit 1 and perCustomerLimit 1, and it is switched off by
 * retireGameCoupon the moment the order that used it is final, so an order
 * that is paid outside the gateway cannot spend it twice either.
 *
 * Created only by the owner's click (actions/admin-thanks-coupon.ts), never
 * by itself.
 */
export const THANKS_PREFIX = "TODAY5-";
export const THANKS_PERCENT = 5;
export const THANKS_DAYS = 60;

/** The promotion's name carries the order it was made for, which is how the
    list and the "already sent" warning find it without a new column. */
export const thanksName = (orderNumber: string) => `תודה · ${orderNumber}`;
export const orderNumberFromThanksName = (name: string) => name.startsWith("תודה · ") ? name.slice("תודה · ".length) : null;

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newThanksCode(random: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  return THANKS_PREFIX + Array.from({ length: 4 }, () => ALPHABET[random(ALPHABET.length)]).join("");
}

export function thanksText(firstName: string, product: string, code: string, until: string): string {
  return [
    `היי ${firstName}, מה שלומך? 😊`,
    `כאן עידן מ-Buy Today 🛒`,
    `רצינו להגיד תודה שבחרת לקנות אצלנו את ${product}! מקווים שאתה נהנה ממנו.`,
    `כתודה, הכנו לך קופון אישי של ${THANKS_PERCENT}% הנחה לקנייה הבאה באתר:`,
    `🎁 ${code}`,
    `הקופון לשימוש חד-פעמי ובתוקף עד ${until}.`,
    `מחכים לראות אותך שוב,`,
    `עידן | צוות Buy Today 💙`,
  ].join("\n");
}

/** The product slot of the template: at most 60 characters, cut with "…",
    and "ועוד N" when the order had more than one. */
export function shortProduct(title: string, extra = 0): string {
  const t = title.trim();
  const cut = t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
  if (!cut) return "ההזמנה";
  return extra > 0 ? `${cut.length > 48 ? `${cut.slice(0, 47).trimEnd()}…` : cut} ועוד ${extra}` : cut;
}
