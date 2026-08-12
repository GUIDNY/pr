"use server";

import { db } from "@/lib/db";
import { mapProductToCard } from "@/lib/queries/products";
import { FINDER_CATEGORIES } from "@/lib/finder-config";

const HOUSEHOLD_RANGES: Record<string, [number, number]> = {
  small: [0, 300],
  medium: [300, 450],
  large: [450, 9999],
};
const WASHER_HOUSEHOLD_RANGES: Record<string, [number, number]> = {
  small: [0, 7],
  medium: [7, 9],
  large: [9, 99],
};
const SCREEN_SIZE_RANGES: Record<string, [number, number]> = {
  small: [0, 44],
  medium: [44, 66],
  large: [66, 999],
};

export type FinderMatch = ReturnType<typeof mapProductToCard> & { reasons: string[] };

export async function findProductsAction(categorySlug: string, answers: Record<string, string>) {
  const config = FINDER_CATEGORIES.find((c) => c.categorySlug === categorySlug);
  if (!config) return [];

  const category = await db.category.findUnique({ where: { slug: categorySlug }, include: { children: true } });
  if (!category) return [];
  const categoryIds = category.children.length > 0 ? category.children.map((c) => c.id) : [category.id];

  let minPrice = 0;
  let maxPrice = Infinity;
  const budget = answers.budget;
  if (budget) {
    const [min, max] = budget.split("-").map(Number);
    minPrice = min;
    maxPrice = max;
  }

  const products = await db.product.findMany({
    where: {
      isPublished: true,
      categoryId: { in: categoryIds },
      stockStatus: { in: ["IN_STOCK", "LOW_STOCK"] },
      price: { gte: minPrice, lte: maxPrice },
    },
    include: {
      brand: true,
      category: { include: { parent: true } },
      attributeValues: { include: { attribute: true } },
    },
  });

  const scored = products.map((p) => {
    let score = 0;
    const reasons: string[] = [];

    if (budget) {
      score += 2;
      reasons.push("במסגרת התקציב שהגדרתם");
    }

    for (const q of config.questions) {
      if (q.type === "budget" || !q.attributeKey) continue;
      const answer = answers[q.id];
      if (!answer || answer === "any") continue;

      const av = p.attributeValues.find((v) => v.attribute.key === q.attributeKey);
      if (!av) continue;

      if (q.id === "household" && q.attributeKey === "capacity") {
        const ranges = categorySlug === "laundry" ? WASHER_HOUSEHOLD_RANGES : HOUSEHOLD_RANGES;
        const [min, max] = ranges[answer] ?? [0, 9999];
        const value = Number(av.value);
        if (value >= min && value < max) {
          score += 3;
          reasons.push(`קיבולת מתאימה למשק בית שבחרתם (${av.value}${av.attribute.unit ?? ""})`);
        }
        continue;
      }

      if (q.id === "size" && q.attributeKey === "screen_size") {
        const [min, max] = SCREEN_SIZE_RANGES[answer] ?? [0, 9999];
        const value = Number(av.value);
        if (value >= min && value < max) {
          score += 3;
          reasons.push(`גודל מסך (${av.value}") תואם למה שביקשתם`);
        }
        continue;
      }

      if (av.value === answer) {
        score += 3;
        reasons.push(`${av.attribute.label}: ${av.value}`);
      }
    }

    if (p.isBestSeller) {
      score += 1;
      reasons.push("מהנמכרים ביותר בקטגוריה");
    }
    if (p.ratingAvg >= 4.3) {
      score += 1;
      reasons.push(`דירוג גבוה (${p.ratingAvg.toFixed(1)} כוכבים)`);
    }

    return { product: p, score, reasons };
  });

  const ranked = scored
    .sort((a, b) => b.score - a.score || b.product.ratingAvg - a.product.ratingAvg)
    .slice(0, 6)
    .filter((r) => r.score > 0);

  return ranked.map((r) => ({ ...mapProductToCard(r.product), reasons: r.reasons.slice(0, 3) }));
}
