import "server-only";
import { db } from "@/lib/db";

export async function getEnrichmentCandidates(status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING") {
  return db.enrichmentCandidate.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          title: true,
          model: true,
          description: true,
          brand: { select: { name: true } },
          category: { select: { name: true, attributes: { select: { key: true, label: true, unit: true } } } },
          images: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
    },
  });
}

export async function getEnrichmentSummary() {
  const [pending, approved, rejected] = await Promise.all([
    db.enrichmentCandidate.count({ where: { status: "PENDING" } }),
    db.enrichmentCandidate.count({ where: { status: "APPROVED" } }),
    db.enrichmentCandidate.count({ where: { status: "REJECTED" } }),
  ]);
  return { pending, approved, rejected };
}
