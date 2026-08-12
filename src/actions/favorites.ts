"use server";

import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function toggleFavoriteAction(productId: string): Promise<{ requiresAuth: boolean; isFavorite: boolean }> {
  const session = await getSession();
  if (!session) return { requiresAuth: true, isFavorite: false };

  const existing = await db.favorite.findUnique({
    where: { userId_productId: { userId: session.sub, productId } },
  });

  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } });
    return { requiresAuth: false, isFavorite: false };
  }

  await db.favorite.create({ data: { userId: session.sub, productId } });
  return { requiresAuth: false, isFavorite: true };
}

export async function getFavoriteProductIdsAction(): Promise<string[]> {
  const session = await getSession();
  if (!session) return [];
  const favorites = await db.favorite.findMany({ where: { userId: session.sub }, select: { productId: true } });
  return favorites.map((f) => f.productId);
}
