import "server-only";
import { db } from "@/lib/db";

export async function getHomepageSection(key: string) {
  const row = await db.homepageSection.findUnique({ where: { key } });
  if (!row || !row.isActive) return null;
  return { ...row, payload: JSON.parse(row.payload) };
}

export async function getActiveBrands() {
  return db.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
}

export async function getCmsPage(slug: string) {
  return db.cmsPage.findUnique({ where: { slug } });
}
