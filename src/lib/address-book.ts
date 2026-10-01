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
 * next checkout should prefill.
 *
 * A *different* place is where the two kinds of entry part company. Dedup
 * alone still grows the book one row per place the customer ever shipped to,
 * and none of those rows was ever asked for — the checkout has no "save this
 * address" box, so every one of them is a side effect. An account that has
 * never saved an address on purpose therefore keeps exactly one automatic
 * row, rewritten in place each time, which is all the next checkout needs to
 * prefill. The moment the customer adds one themselves (savedByUser, set by
 * addAddressAction) the book is theirs: nothing is rewritten after that, and
 * new places are added alongside.
 *
 * Rewriting is safe because it is only ever the book. The order carries its
 * own copy of where it went (ship* on Order, see lib/order-address.ts), so an
 * order already placed cannot be moved by anything here.
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
    select: {
      id: true,
      city: true,
      street: true,
      houseNo: true,
      apartment: true,
      isDefault: true,
      savedByUser: true,
    },
  });

  const fields = {
    fullName: address.fullName,
    phone: address.phone,
    city: address.city,
    street: address.street,
    houseNo: address.houseNo,
    apartment: address.apartment || null,
    notes: address.notes || null,
  };

  const existing = book.find((row) => sameAddress(row, address));
  if (existing) {
    /* Same place: only the parts that can legitimately differ between two
       deliveries to it. Notes only when there are some, so an order placed
       without one does not wipe the note left on a previous order. */
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

  /* A new place. If the customer has never saved an address themselves, the
     single automatic row is theirs to rewrite rather than to accumulate
     beside. `isDefault` stays whatever it was: rewriting the only row must
     not leave the account with no default. */
  const slot = book.some((row) => row.savedByUser)
    ? null
    : (book.find((row) => row.isDefault) ?? book[0] ?? null);
  if (slot) {
    await db.address.update({ where: { id: slot.id }, data: fields });
    return slot.id;
  }

  const created = await db.address.create({
    data: { userId, ...fields, isDefault: book.length === 0 },
  });
  return created.id;
}
