"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ProductCard } from "@/components/product/product-card";
import { findProductsAction, type FinderMatch } from "@/actions/finder";
import type { FinderConfig } from "@/lib/finder-config";

export function FinderWizard({ config }: { config: FinderConfig }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<FinderMatch[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const question = config.questions[step];
  const progress = ((step + (results ? 1 : 0)) / config.questions.length) * 100;

  function selectAnswer(value: string) {
    const next = { ...answers, [question.id]: value };
    setAnswers(next);

    if (step + 1 < config.questions.length) {
      setStep(step + 1);
    } else {
      startTransition(async () => {
        const matches = await findProductsAction(config.categorySlug, next);
        setResults(matches);
      });
    }
  }

  function restart() {
    setStep(0);
    setAnswers({});
    setResults(null);
  }

  if (isPending) {
    return <div className="text-muted-foreground py-24 text-center">מחפשים עבורכם את ההתאמות הטובות ביותר...</div>;
  }

  if (results) {
    return (
      <div>
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl font-bold">
            {results.length > 0 ? `מצאנו ${results.length} מוצרים שמתאימים לכם` : "לא מצאנו התאמה מדויקת"}
          </h2>
          <Button variant="ghost" size="sm" onClick={restart} className="gap-1.5">
            <RotateCcw className="size-4" /> התחל מחדש
          </Button>
        </div>

        {results.length === 0 ? (
          <div className="text-muted-foreground py-12 text-center">
            נסו להרחיב את הטווח או לבחור &quot;לא משנה&quot; בחלק מהשאלות.
            <div className="mt-4">
              <Button variant="brand" onClick={restart}>
                נסו שוב
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {results.map((product) => (
              <div key={product.id} className="flex flex-col gap-2">
                <ProductCard product={product} />
                <div className="bg-brand/5 border-brand/20 rounded-lg border p-3">
                  <p className="text-brand mb-1.5 flex items-center gap-1 text-xs font-semibold">
                    <Sparkles className="size-3.5" /> למה זה מתאים לכם
                  </p>
                  <ul className="text-muted-foreground flex flex-col gap-0.5 text-xs">
                    {product.reasons.map((r, i) => (
                      <li key={i}>• {r}</li>
                    ))}
                    {/* What this one does not do. A recommendation that lists
                        only its good points is a sales pitch; naming the
                        preference it misses — or the spec nobody has filled
                        in yet — is what makes the rest of the list credible. */}
                    {product.caveats.map((c, i) => (
                      <li key={`caveat-${i}`} className="text-warning-foreground">
                        • {c}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/finder" className="text-muted-foreground hover:text-foreground">
          <ArrowRight className="size-5 rtl:rotate-180" />
        </Link>
        <Progress value={progress} className="h-1.5 flex-1" />
        <span className="text-muted-foreground shrink-0 text-xs">
          {step + 1}/{config.questions.length}
        </span>
      </div>

      <h2 className="mb-6 text-center text-2xl font-bold">{question.question}</h2>

      <div className="mx-auto grid max-w-lg grid-cols-1 gap-3 sm:grid-cols-2">
        {question.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => selectAnswer(opt.value)}
            className="border-input hover:border-brand hover:bg-brand/5 rounded-xl border p-4 text-center font-medium transition-colors"
          >
            {opt.label}
          </button>
        ))}
      </div>

      {step > 0 && (
        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
            חזרה לשאלה הקודמת
          </Button>
        </div>
      )}
    </div>
  );
}
