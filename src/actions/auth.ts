"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { createSession, clearSession, hashPassword, verifyPassword } from "@/lib/auth";

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
    where: { userId: null, guestEmail: { equals: email, mode: "insensitive" } },
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
