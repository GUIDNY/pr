"use server";

import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { mapProductToCard } from "@/lib/queries/products";
import { FINDER_CATEGORIES, type FinderOption, type FinderQuestion } from "@/lib/finder-config";
import { formatPrice } from "@/lib/format";

export type FinderMatch = ReturnType<typeof mapProductToCard> & {
  reasons: string[];
  // What the customer asked for and this product could not be shown to have —
  // either because it is the wrong value or because nobody has filled that
  // spec in yet. Named rather than swallowed: the wizard's own heading
  // promises an explanation per recommendation, and "we don't know" is a
  // truthful one where "בתוך התקציב" alone was not.
  caveats: string[];
};

// Attribute values are enriched free text and carry their units: "9 ק״ג",
// "עד 7 ק״ג", '55"'. Number() on any of those is NaN, which is why every
// capacity and screen-size answer used to fall through and match nothing.
function firstNumber(value: string): number | null {
  const m = value.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function optionMatchesValue(option: FinderOption, storedValue: string): boolean {
  if (option.range) {
    const n = firstNumber(storedValue);
    if (n === null) return false;
    return n >= option.range[0] && n < option.range[1];
  }
  if (option.match) {
    const haystack = storedValue.toLowerCase();
    if (option.match.excludes?.some((bad) => haystack.includes(bad.toLowerCase()))) return false;
    return option.match.contains.some((good) => haystack.includes(good.toLowerCase()));
  }
  return false;
}

function chosenOption(question: FinderQuestion, answer: string): FinderOption | undefined {
  return question.options.find((o) => o.value === answer);
}

export async function findProductsAction(categorySlug: string, answers: Record<string, string>) {
  const config = FINDER_CATEGORIES.find((c) => c.categorySlug === categorySlug);
  if (!config) return [];

  const category = await db.category.findUnique({ where: { slug: categorySlug }, include: { children: true } });
  if (!category) return [];
  // The department's own products count too. Under "refrigeration" the 43
  // fridges sit directly on the department and only the 16 freezers live in a
  // child category, so preferring children whenever any exist meant the
  // "מקררים" wizard answered every question with freezers.
  const categoryIds = [category.id, ...category.children.map((c) => c.id)];

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
      ...PUBLIC_PRODUCT_WHERE,
      categoryId: { in: categoryIds },
      price: { gte: minPrice, lte: maxPrice },
    },
    include: {
      brand: true,
      category: { include: { parent: true } },
      attributeValues: { include: { attribute: true } },
      images: { take: 1, orderBy: { sortOrder: "asc" } },
    },
  });

  // Questions the customer actually expressed a preference on — "לא משנה" is
  // not a preference, and neither is a question they never reached.
  const activeQuestions = config.questions.filter(
    (q) => q.type !== "budget" && q.attributeKey && answers[q.id] && answers[q.id] !== "any",
  );

  const scored = products.map((p) => {
    let score = 0;
    const reasons: string[] = [];
    const caveats: string[] = [];
    let matchedAnswers = 0;

    if (budget) {
      score += 2;
      reasons.push(`בתוך התקציב — ${formatPrice(p.price)}`);
    }

    for (const q of activeQuestions) {
      const option = chosenOption(q, answers[q.id]);
      if (!option) continue;
      const label = q.reasonLabel ?? q.id;
      const av = p.attributeValues.find((v) => v.attribute.key === q.attributeKey);

      if (!av) {
        // No value on file. Not a mismatch, but not a match either, and
        // saying so beats quietly ranking it as though it qualified.
        caveats.push(`${label}: אין נתון לגבי המוצר הזה`);
        continue;
      }

      const unit = av.attribute.unit ? ` ${av.attribute.unit}` : "";
      if (optionMatchesValue(option, av.value)) {
        score += 3;
        matchedAnswers++;
        reasons.push(`${label}: ${av.value}${unit} — כפי שביקשתם`);
      } else {
        score -= 2;
        caveats.push(`${label}: ${av.value}${unit}, ולא ${option.label}`);
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

    return { product: p, score, reasons, caveats, matchedAnswers };
  });

  // When the customer stated preferences and something in the catalog meets at
  // least one of them, only those are worth showing. Falling back to the whole
  // budget-filtered list otherwise is deliberate — an empty result page helps
  // nobody — but those come back carrying their caveats, so the reasons under
  // each card say what it does and doesn't do rather than implying a fit.
  const withRealMatch = scored.filter((r) => r.matchedAnswers > 0);
  const pool = activeQuestions.length > 0 && withRealMatch.length > 0 ? withRealMatch : scored;

  return pool
    .sort(
      (a, b) => b.matchedAnswers - a.matchedAnswers || b.score - a.score || b.product.ratingAvg - a.product.ratingAvg,
    )
    .slice(0, 6)
    .map((r) => ({
      ...mapProductToCard(r.product),
      reasons: r.reasons.slice(0, 3),
      caveats: r.caveats.slice(0, 2),
    }));
}
