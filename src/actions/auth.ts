"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, createSession, clearSession, hashPassword, verifyPassword } from "@/lib/auth";
import { looksLikePhone, normalizeIsraeliPhone } from "@/lib/phone";

/* One field, two kinds of answer. It cannot be z.email() any more, so the
   shape of what was typed is worked out below instead of rejected here. */
const loginSchema = z.object({
  identifier: z.string().trim().min(1, "יש להזין אימייל או טלפון"),
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

/**
 * Signing in with an email address or a phone number.
 *
 * The field used to accept an address only, which is not how people here
 * identify themselves — the first thing typed into it on the live site was a
 * mobile number. The column was already there and already filled; nothing
 * was looking at it.
 *
 * Phone is the awkward half, and the awkwardness is real rather than
 * theoretical: User.phone is not unique, and on this database one number
 * already sits on two accounts. So the phone path refuses whenever it
 * matches more than one, and says to use the email instead. Picking "the
 * first" would mean a number shared by two people signs one of them into
 * the other's account, and which one depends on row order.
 *
 * Both failures answer with the same sentence. An error that distinguishes
 * "no such account" from "wrong password" tells anybody who asks which
 * addresses and numbers are registered here.
 */
export async function loginAction(input: { identifier: string; password: string }) {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const { identifier, password } = parsed.data;
  const WRONG = { success: false as const, error: "הפרטים שהוזנו אינם נכונים" };

  let user;
  if (looksLikePhone(identifier)) {
    const phone = normalizeIsraeliPhone(identifier);
    if (!phone) return WRONG;
    const matches = await db.user.findMany({ where: { phone }, take: 2 });
    if (matches.length > 1) {
      return {
        success: false as const,
        error: "מספר הטלפון הזה רשום על יותר מחשבון אחד. אפשר להתחבר עם כתובת המייל.",
      };
    }
    user = matches[0];
  } else {
    user = await db.user.findUnique({ where: { email: identifier.toLowerCase() } });
  }

  if (!user) return WRONG;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return WRONG;

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
    /* Stored in the canonical form so that signing in with the same number
       written differently still finds this row. */
    data: {
      name: parsed.data.name,
      email,
      phone: normalizeIsraeliPhone(parsed.data.phone) ?? parsed.data.phone,
      passwordHash,
      role: "CUSTOMER",
    },
  });

  await createSession({ sub: user.id, role: "CUSTOMER", name: user.name });
  await claimGuestOrders(user.id, email);
  return { success: true, error: null };
}

const setPasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6, "הסיסמה חייבת להכיל לפחות 6 תווים"),
});

/**
 * Choosing a password, or replacing one.
 *
 * Two jobs behind one form, and which one it does is decided by the account
 * rather than by what the form sent:
 *
 *   An account that has a password must prove the current one. Otherwise
 *   anybody who finds a signed-in browser unattended takes the account for
 *   good — changing the password is how you lock the owner out of their own
 *   order history.
 *
 *   An account created through Google has no password to prove. Demanding
 *   one would be asking for something that does not exist, and the random
 *   bytes standing in for it cannot be typed. Being signed in is the proof
 *   here, and it is the same proof Google just gave.
 *
 * The distinction comes from User.hasPassword and never from whether the
 * form filled the field in — a client that simply omits currentPassword must
 * not be able to skip the check.
 */
export async function setPasswordAction(input: { currentPassword?: string; newPassword: string }) {
  const session = await getSession();
  if (!session) return { success: false, error: "צריך להתחבר מחדש" };

  const parsed = setPasswordSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  const user = await db.user.findUnique({ where: { id: session.sub } });
  if (!user) return { success: false, error: "צריך להתחבר מחדש" };

  if (user.hasPassword) {
    const current = parsed.data.currentPassword ?? "";
    if (!current) return { success: false, error: "יש להזין את הסיסמה הנוכחית" };
    const valid = await verifyPassword(current, user.passwordHash);
    if (!valid) return { success: false, error: "הסיסמה הנוכחית אינה נכונה" };
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword), hasPassword: true },
  });

  return { success: true, error: null };
}

/** Does this account have a password, or only Google? The form asks before it renders. */
export async function accountHasPassword(): Promise<boolean> {
  const session = await getSession();
  if (!session) return true;
  const user = await db.user.findUnique({ where: { id: session.sub }, select: { hasPassword: true } });
  return user?.hasPassword ?? true;
}

/**
 * Clears the session, and deliberately does not redirect.
 *
 * It used to end with redirect("/"), which is a client-side navigation — so
 * the React tree survived it and the header kept the name, the cart badge
 * and the filled hearts it had already fetched. LogoutButton sends the
 * browser to "/" itself, as a real page load, which is the only way to be
 * sure nothing of the last session is still on screen.
 */
export async function logoutAction() {
  await clearSession();
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
 * Copying the email would otherwise undo half of this. claimGuestOrders above
 * gives every ownerless order with a matching email to whoever next signs in
 * with it, and a detached order is ownerless with that email written on it —
 * so registering again with the same address brought the whole history back.
 *
 * It was argued that this is the same person by the same proof the
 * order-tracking page already accepts, and disclosed on the deletion page
 * instead of being changed. What that argument misses is the address that
 * outlives its owner: a work address reassigned, a provider recycling a
 * mailbox. Whoever registers it next is not the same person, and what they
 * would receive is somebody's name, phone and delivery address. So the orders
 * this detaches are stamped with ownerDeletedAt and the claim skips them; the
 * break is real, and the deletion page now says that instead.
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
