"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sameAddress } from "@/lib/address-book";

const addressSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().min(9),
  city: z.string().min(1),
  street: z.string().min(1),
  houseNo: z.string().min(1),
  apartment: z.string().optional(),
  notes: z.string().optional(),
});

export async function addAddressAction(input: z.infer<typeof addressSchema>) {
  const session = await getSession();
  if (!session) return { success: false, error: "יש להתחבר" };

  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

  /* Adding it here is the customer saying they want it kept, which is what
     savedByUser records and what stops rememberAddress rewriting the book
     from then on — see lib/address-book.ts.

     The same place twice is still one row. Usually that is this form being
     used to confirm an address a checkout already left behind: the row
     exists, the customer does not know it is automatic, and pressing save
     should promote it rather than leave them looking at it twice. */
  const book = await db.address.findMany({
    where: { userId: session.sub },
    select: { id: true, city: true, street: true, houseNo: true, apartment: true },
  });
  const existing = book.find((row) => sameAddress(row, parsed.data));
  if (existing) {
    await db.address.update({
      where: { id: existing.id },
      data: { ...parsed.data, savedByUser: true },
    });
  } else {
    await db.address.create({
      data: {
        ...parsed.data,
        userId: session.sub,
        savedByUser: true,
        isDefault: book.length === 0,
      },
    });
  }

  revalidatePath("/account/addresses");
  return { success: true, error: null };
}

export async function deleteAddressAction(addressId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "יש להתחבר" };

  await db.address.deleteMany({ where: { id: addressId, userId: session.sub } });
  revalidatePath("/account/addresses");
  return { success: true, error: null };
}

export async function setDefaultAddressAction(addressId: string) {
  const session = await getSession();
  if (!session) return { success: false, error: "יש להתחבר" };

  await db.address.updateMany({ where: { userId: session.sub }, data: { isDefault: false } });
  await db.address.updateMany({ where: { id: addressId, userId: session.sub }, data: { isDefault: true } });
  revalidatePath("/account/addresses");
  return { success: true, error: null };
}
