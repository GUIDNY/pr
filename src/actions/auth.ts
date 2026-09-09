"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession, createSession, clearSession, hashPassword, verifyPassword } from "@/lib/auth";

const loginSchema = z.object({
  email: z.email("כתובת אימייל לא תקינה"),
  password: z.string().min(1, "יש להזין סיסמה"),
});

const registerSchema = z.object({
  name: z.string().min(2, "יש להזין שם מלא"),
  email: z.email("כתובת אימייל לא תקינה"),
  phone: z.string().min(9, "מספר טלפון לא תקין"),
  password: z.string().min(6, "הסיסמה חייבת להכיל לפחות 6 תווים"),
});

/**
 * Hands an account the orders it already placed as a guest.
 *
 * Checkout does not require an account, so the usual first order of a customer's
 * life is a guest order — and it was reaching `Order.userId = null` and staying
 * there for ever. Registering with the very same address the order was placed
 * under, minutes later, still produced "עדיין לא ביצעתם הזמנות", and nothing in
 * the system ever connected the two again.
 *
 * The email alone is the proof, which is the same standard the order-tracking
 * page already applies: `verifyOrderAccess` shows a whole order to anyone who
 * can name the email or the phone on it. Registration is a stronger claim than
 * typing an address into a form, and it cannot be used to reach an existing
 * customer's orders — an email that already has an account cannot be registered
 * again, and this only ever touches orders with no owner.
 *
 * Run on login too, not only on registration: the guest order may have been
 * placed by someone who already had an account and simply did not sign in.
 */
async function claimGuestOrders(userId: string, email: string) {
  await db.order.updateMany({
    where: {
      userId: null,
      guestEmail: { equals: email, mode: "insensitive" },
      /* Except the orders of an account that was deleted. Deletion detaches
         them and copies the customer's contact details into the very guest
         fields this matches on, so without this they would be handed back to
         whoever registers that address next — most likely the same person,
         which quietly returns the history they asked us to close the door on,
         and otherwise a stranger who happens to reuse the address. */
      ownerDeletedAt: null,
    },
    data: { userId },
  });
}

export async function loginAction(input: { email: string; password: string }) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (!user) return { success: false, error: "אימייל או סיסמה שגויים" };

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { success: false, error: "אימייל או סיסמה שגויים" };

  await createSession({ sub: user.id, role: user.role as never, name: user.name });
  await claimGuestOrders(user.id, user.email);
  return { success: true, error: null, role: user.role };
}

export async function registerAction(input: { name: string; email: string; phone: string; password: string }) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const email = parsed.data.email.toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return { success: false, error: "כתובת האימייל כבר רשומה במערכת" };

  const passwordHash = await hashPassword(parsed.data.password);
  const user = await db.user.create({
    data: { name: parsed.data.name, email, phone: parsed.data.phone, passwordHash, role: "CUSTOMER" },
  });

  await createSession({ sub: user.id, role: "CUSTOMER", name: user.name });
  await claimGuestOrders(user.id, email);
  return { success: true, error: null };
}

export async function logoutAction() {
  await clearSession();
  redirect("/");
}

const deleteAccountSchema = z.object({
  password: z.string().min(1, "יש להזין את הסיסמה כדי לאשר"),
});

/**
 * Closes a customer's own account, for good.
 *
 * App Store guideline 5.1.1(v) requires an app that lets someone create an
 * account to let them delete it from inside the app, and it has to be a real
 * deletion rather than a flag that hides the row. So this deletes the User,
 * and the schema does the rest: addresses, the cart and favourites are
 * `onDelete: Cascade` and go with it, while orders, reviews, support requests
 * and complaints hold an optional userId and are simply detached.
 *
 * WHAT SURVIVES, AND WHY IT HAS TO. An order is a sales record, and the shop
 * is required to keep those for years after the account behind them is gone —
 * so before the row disappears the customer's name, email and phone are copied
 * onto their orders, into the three guest fields that already exist for orders
 * placed without an account. Detaching without that copy would leave an
 * invoice belonging to nobody. The page that offers this says so in as many
 * words: what goes, and what stays.
 *
 * The password is asked for again. The session cookie only proves the browser
 * was logged in at some point, which on a shared or borrowed phone is not the
 * same as the account's owner standing there — and this is the one action in
 * the shop with nothing to undo it with.
 *
 * Copying the email has a consequence worth stating: claimGuestOrders above
 * gives every ownerless order with a matching email to whoever next signs in
 * with it, so registering again with the same address brings this history
 * back. That is the same person by the same proof the order-tracking page
 * already accepts, so it is left as it is — and the deletion page says it in
 * as many words rather than promising a break it does not make.
 *
 * Staff and admins are refused. Their accounts own audit trails, order notes
 * and sync history, and the storefront is not where an operator account should
 * be closable in one click by whoever is holding the phone.
 */
export async function deleteAccountAction(input: { password: string }) {
  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const session = await getSession();
  if (!session) return { success: false, error: "יש להתחבר מחדש כדי למחוק את החשבון" };

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return { success: false, error: "החשבון לא נמצא" };

  if (user.role !== "CUSTOMER") {
    return { success: false, error: "חשבונות צוות נמחקים מהניהול, לא מהאזור האישי" };
  }

  const valid = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!valid) return { success: false, error: "הסיסמה שגויה" };

  await db.$transaction([
    db.order.updateMany({
      where: { userId: user.id },
      data: {
        guestName: user.name,
        guestEmail: user.email,
        guestPhone: user.phone,
        // Marks these as detached by a deletion rather than placed as a guest,
        // so registering this email again never claims them back.
        ownerDeletedAt: new Date(),
      },
    }),
    db.user.delete({ where: { id: user.id } }),
  ]);

  await clearSession();
  return { success: true, error: null };
}
