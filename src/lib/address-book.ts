import "server-only";
import { db } from "@/lib/db";

/**
 * The account's address book, written from orders.
 *
 * Every order used to add a row to it, so a customer who bought three times
 * from the same flat had the same address three times over, and the checkout
 * with its auto-opened card form (every change to the basket makes a new
 * pending order) could add several in a minute. The book is meant to hold the
 * places a customer ships to, once each.
 *
 * So an address that is already there is reused: the same city, street, house
 * number and apartment, compared after trimming, collapsing spaces and
 * ignoring case, with an empty apartment the same as none. Reusing it updates
 * the name, phone and note on it to the latest ones given, which is what the
 * next checkout should prefill. A new place gets a new row.
 *
 * The order never depends on this row for where it goes: it carries its own
 * copy (ship* on Order, see lib/order-address.ts), so reusing or updating a
 * book entry cannot move an order that was already placed.
 */
export type BookAddress = {
  fullName: string;
  phone: string;
  city: string;
  street: string;
  houseNo: string;
  apartment?: string | null;
  notes?: string | null;
};

const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export function sameAddress(
  a: Pick<BookAddress, "city" | "street" | "houseNo" | "apartment">,
  b: Pick<BookAddress, "city" | "street" | "houseNo" | "apartment">,
): boolean {
  return (
    norm(a.city) === norm(b.city) &&
    norm(a.street) === norm(b.street) &&
    norm(a.houseNo) === norm(b.houseNo) &&
    norm(a.apartment) === norm(b.apartment)
  );
}

/** Finds this address in the account's book or adds it; returns its id. */
export async function rememberAddress(userId: string, address: BookAddress): Promise<string> {
  const book = await db.address.findMany({
    where: { userId },
    select: { id: true, city: true, street: true, houseNo: true, apartment: true },
  });
  const existing = book.find((row) => sameAddress(row, address));
  if (existing) {
    await db.address.update({
      where: { id: existing.id },
      data: {
        fullName: address.fullName,
        phone: address.phone,
        ...(address.notes ? { notes: address.notes } : {}),
      },
    });
    return existing.id;
  }
  const created = await db.address.create({
    data: {
      userId,
      fullName: address.fullName,
      phone: address.phone,
      city: address.city,
      street: address.street,
      houseNo: address.houseNo,
      apartment: address.apartment || null,
      notes: address.notes || null,
      isDefault: book.length === 0,
    },
  });
  return created.id;
}
