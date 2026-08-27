import "server-only";
import { db } from "@/lib/db";

export async function getOrderByNumber(orderNumber: string) {
  return db.order.findUnique({
    where: { orderNumber },
    include: {
      items: true,
      address: true,
      statusHistory: { orderBy: { createdAt: "asc" } },
      notes: { where: { isInternal: false }, orderBy: { createdAt: "asc" } },
    },
  });
}

// Phone numbers are typed differently every time they're typed: 050-123-4567,
// 050 123 4567, +972501234567, 972-50-1234567. Comparing the raw strings meant
// a customer had to reproduce the exact formatting they used at checkout, which
// nobody remembers. Compare digits only, with the Israeli country code folded
// back to a leading zero so both spellings of the same number agree.
function normalisePhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("972") ? `0${digits.slice(3)}` : digits;
}

function normaliseEmail(value: string): string {
  return value.trim().toLowerCase();
}

export async function verifyOrderAccess(orderNumber: string, contact: string) {
  const order = await getOrderByNumber(orderNumber);
  if (!order) return null;

  const email = normaliseEmail(contact);
  const phone = normalisePhone(contact);
  // A blank contact must never match a record that simply has nothing stored
  // in that field — this is the check standing between an order number and
  // someone else's order details.
  if (!email && !phone) return null;

  const account = order.userId
    ? await db.user.findUnique({
        where: { id: order.userId },
        select: { email: true, phone: true },
      })
    : null;

  const emails = [order.guestEmail, account?.email].filter(Boolean) as string[];
  const phones = [order.guestPhone, account?.phone].filter(Boolean) as string[];

  const matches =
    (!!email && emails.some((candidate) => normaliseEmail(candidate) === email)) ||
    (!!phone && phones.some((candidate) => normalisePhone(candidate) === phone));

  return matches ? order : null;
}
