/**
 * The hand-sent WhatsApp to a customer who did not finish paying, in the
 * owner's own wording. Opened as a wa.me link with the text typed in; the
 * person presses send in their own WhatsApp. Nothing is sent by the system.
 */
export type ReminderKind = "PAYMENT" | "CART";

export function firstNameOf(full: string | null | undefined): string {
  const first = (full ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "שלום";
}

/** One full product name, or the first and a count when there are several. */
export function productPhrase(titles: string[]): string {
  const clean = titles.map((t) => t.trim()).filter(Boolean);
  if (clean.length === 0) return "המוצר שבחרת";
  return clean.length === 1 ? clean[0] : `${clean[0]} ועוד ${clean.length - 1} מוצרים`;
}

export function reminderText(kind: ReminderKind, firstName: string, product: string): string {
  const middle =
    kind === "PAYMENT"
      ? `ראינו שניסית לבצע הזמנה באתר שלנו עבור ${product}, אבל נראה שהתשלום לא הושלם וההזמנה לא נסגרה.`
      : `ראינו שהתעניינת ב-${product} באתר שלנו ולא השלמת את ההזמנה.`;
  return [
    `היי ${firstName}, מה שלומך? 😊`,
    `מדברים מ-Buy Today 🛒`,
    middle,
    `נשמח לעזור לך להשלים את ההזמנה בצורה פשוטה ומהירה, וכמובן לעמוד לרשותך בכל שאלה או בקשה.`,
    `אם זה עדיין רלוונטי, נשמח לחזור אליך ולעזור לך באופן אישי.`,
    `תודה רבה ויום מקסים!`,
    `עידן | צוות Buy Today 💙`,
  ].join("\n");
}
