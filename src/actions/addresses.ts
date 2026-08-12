"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

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

  const existingCount = await db.address.count({ where: { userId: session.sub } });
  await db.address.create({
    data: { ...parsed.data, userId: session.sub, isDefault: existingCount === 0 },
  });

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
