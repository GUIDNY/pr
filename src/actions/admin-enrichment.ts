"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

async function approveCandidate(id: string, actorId: string): Promise<{ success: boolean; slug?: string; error?: string }> {
  const candidate = await db.enrichmentCandidate.findUnique({ where: { id } });
  if (!candidate || candidate.status !== "PENDING") {
    return { success: false, error: "המועמד לא נמצא או שכבר טופל" };
  }

  const product = await db.$transaction(async (tx) => {
    if (candidate.description) {
      await tx.product.update({
        where: { id: candidate.productId },
        data: { description: candidate.description, enrichmentStatus: "ENRICHED" },
      });
    } else {
      await tx.product.update({ where: { id: candidate.productId }, data: { enrichmentStatus: "ENRICHED" } });
    }
    if (candidate.imageUrl) {
      const existingImage = await tx.productImage.findFirst({ where: { productId: candidate.productId } });
      if (!existingImage) {
        await tx.productImage.create({ data: { productId: candidate.productId, url: candidate.imageUrl, sortOrder: 0 } });
      }
    }
    if (candidate.specs) {
      // Only keys that match a real CategoryAttribute for this product's
      // category get written — a spec the manufacturer page mentioned but
      // that isn't a defined field here is silently dropped rather than
      // creating an ad-hoc attribute no filter or comparison table knows
      // about.
      const productForSpecs = await tx.product.findUniqueOrThrow({
        where: { id: candidate.productId },
        select: { categoryId: true },
      });
      const attributes = await tx.categoryAttribute.findMany({ where: { categoryId: productForSpecs.categoryId } });
      const proposed = JSON.parse(candidate.specs) as Record<string, string>;
      for (const attr of attributes) {
        const value = proposed[attr.key];
        if (value === undefined || value === null || value === "") continue;
        await tx.productAttributeValue.upsert({
          where: { productId_attributeId: { productId: candidate.productId, attributeId: attr.id } },
          update: { value: String(value) },
          create: { productId: candidate.productId, attributeId: attr.id, value: String(value) },
        });
      }
    }
    await tx.enrichmentCandidate.update({
      where: { id },
      data: { status: "APPROVED", reviewedAt: new Date(), reviewedById: actorId },
    });
    return tx.product.findUniqueOrThrow({ where: { id: candidate.productId }, select: { slug: true } });
  });

  await logAudit({ actorId, action: "ENRICHMENT_APPROVED", entityType: "Product", entityId: candidate.productId });
  // The approved image/description just landed on the live storefront page
  // too — that page isn't behind any admin path, so it needs its own
  // explicit revalidation or it keeps serving the pre-approval cached render.
  revalidatePath(`/product/${product.slug}`);
  return { success: true, slug: product.slug };
}

export async function approveEnrichmentCandidateAction(id: string) {
  const session = await requireAdmin();
  const result = await approveCandidate(id, session.sub);
  revalidatePath("/admin/inventory/enrichment");
  revalidatePath("/admin/inventory");
  return { success: result.success, error: result.error ?? null };
}

export async function approveAllEnrichmentCandidatesAction() {
  const session = await requireAdmin();
  const pending = await db.enrichmentCandidate.findMany({ where: { status: "PENDING" }, select: { id: true } });

  let approved = 0;
  let failed = 0;
  for (const c of pending) {
    const result = await approveCandidate(c.id, session.sub);
    if (result.success) approved++;
    else failed++;
  }

  revalidatePath("/admin/inventory/enrichment");
  revalidatePath("/admin/inventory");
  return { success: true, approved, failed, error: null };
}

export async function rejectEnrichmentCandidateAction(id: string) {
  const session = await requireAdmin();
  const candidate = await db.enrichmentCandidate.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date(), reviewedById: session.sub },
  });
  await logAudit({ actorId: session.sub, action: "ENRICHMENT_REJECTED", entityType: "Product", entityId: candidate.productId });
  revalidatePath("/admin/inventory/enrichment");
  return { success: true, error: null };
}
