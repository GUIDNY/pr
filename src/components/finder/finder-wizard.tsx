"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Pencil, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductCard } from "@/components/product/product-card";
import { findProductsAction, type FinderMatch } from "@/actions/finder";
import type { FinderConfig } from "@/lib/finder-config";
import { cn } from "@/lib/utils";

/**
 * Alfred asks, the shopper taps, the shelf answers.
 *
 * One question at a time, each with its answer remembered so going back
 * shows what was chosen; a step bar that says where you are; results
 * that carry the answers as chips, each a way back to that one question
 * without starting over; and a no-match state that says what to change.
 */
export function FinderWizard({ config }: { config: FinderConfig }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<FinderMatch[] | null>(null);
  const [isPending, startTransition] = useTransition();

  const questions = config.questions;
  const question = questions[step];

  function search(next: Record<string, string>) {
    startTransition(async () => {
      setResults(await findProductsAction(config.categorySlug, next));
    });
  }

  function selectAnswer(value: string) {
    const next = { ...answers, [question.id]: value };
    setAnswers(next);
    // Straight to the next question without an answer; when every question
    // has one (also after a chip on the results sent us back to fix one),
    // go to the shelf.
    const pending = questions.findIndex((q, i) => i > step && !next[q.id]);
    if (pending !== -1) setStep(pending);
    else search(next);
  }

  function editAnswer(i: number) {
    setResults(null);
    setStep(i);
  }

  function restart() {
    setStep(0);
    setAnswers({});
    setResults(null);
  }

  const header = (
    <div className="mb-6 flex items-center gap-3">
      <Link href="/finder" className="text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-full" aria-label="חזרה לבחירת מוצר">
        <ArrowRight className="size-5" />
      </Link>
      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
        {config.title}
        {!results && <span className="text-muted-foreground font-normal"> · שאלה {step + 1} מתוך {questions.length}</span>}
      </p>
      <Link href={`/category/${config.categorySlug}`} className="text-brand text-xs font-semibold underline-offset-4 hover:underline">
        לכל ה{config.title}
      </Link>
    </div>
  );

  if (isPending) {
    return (
      <div>
        {header}
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <Image src="/mascot/alfred-face.png" alt="" width={72} height={72} className="size-18 animate-pulse rounded-full object-cover" />
          <p className="text-lg font-bold">אלפרד בודק את המדפים...</p>
          <p className="text-muted-foreground text-sm">רק דגמים במלאי, בתקציב שלכם</p>
        </div>
      </div>
    );
  }

  if (results) {
    const chips = questions.map((q, i) => ({
      i,
      question: q,
      label: q.options.find((o) => o.value === answers[q.id])?.label ?? "—",
    }));
    return (
      <div>
        {header}
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button
              key={c.question.id}
              type="button"
              onClick={() => editAnswer(c.i)}
              className="border-border bg-card hover:border-brand/40 hover:text-brand inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
              title={c.question.question}
            >
              {c.label}
              <Pencil className="size-3 opacity-60" />
            </button>
          ))}
          <button type="button" onClick={restart} className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 px-2 py-1.5 text-xs">
            <RotateCcw className="size-3.5" /> מהתחלה
          </button>
        </div>

        {results.length === 0 ? (
          <div className="border-border bg-card mx-auto max-w-lg rounded-2xl border p-8 text-center">
            <Image src="/mascot/alfred-face.png" alt="" width={64} height={64} className="mx-auto mb-3 size-16 rounded-full object-cover" />
            <h2 className="text-xl font-bold">אין דגם במלאי שעונה על הכול</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              לרוב זה התקציב או צבע ספציפי. שנו תשובה אחת למעלה, או בחרו &quot;לא משנה&quot;.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {questions[0]?.type === "budget" && (
                <Button variant="brand" onClick={() => editAnswer(0)}>
                  לשנות את התקציב
                </Button>
              )}
              <Button variant="outline" asChild>
                <Link href={`/category/${config.categorySlug}`}>לכל ה{config.title}</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-start gap-3">
              <Image src="/mascot/alfred-face.png" alt="" width={44} height={44} className="size-11 shrink-0 rounded-full object-cover" />
              <div>
                <h2 className="text-xl font-bold sm:text-2xl">
                  {results.length === 1 ? "מצאתי דגם אחד שמתאים לכם" : `מצאתי ${results.length} דגמים שמתאימים לכם`}
                </h2>
                <p className="text-muted-foreground text-sm">מסודרים לפי ההתאמה. מתחת לכל אחד כתוב למה.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((product, i) => (
                <div key={product.id} className="relative flex flex-col gap-2">
                  {i === 0 && (
                    <span className="bg-brand text-brand-foreground absolute top-3 start-3 z-10 rounded-full px-2.5 py-1 text-[11px] font-bold shadow">
                      ההתאמה הטובה ביותר
                    </span>
                  )}
                  <ProductCard product={product} />
                  <div className="bg-brand/5 border-brand/20 rounded-xl border p-3">
                    <p className="text-brand mb-1.5 flex items-center gap-1 text-xs font-semibold">
                      <Sparkles className="size-3.5" /> למה זה מתאים לכם
                    </p>
                    <ul className="text-muted-foreground flex flex-col gap-1 text-xs">
                      {product.reasons.map((r, j) => (
                        <li key={j} className="flex items-start gap-1.5">
                          <Check className="text-success mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {header}

      {/* The step bar: one segment per question, filled as far as here. */}
      <div className="mb-8 flex gap-1.5" aria-hidden>
        {questions.map((q, i) => (
          <span key={q.id} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-muted")} />
        ))}
      </div>

      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-start gap-3">
          <Image src="/mascot/alfred-face.png" alt="" width={48} height={48} className="size-12 shrink-0 rounded-full object-cover" />
          <div className="bg-card relative rounded-2xl rounded-ss-sm px-4 py-3 shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)]">
            <h2 className="text-lg font-bold sm:text-xl">{question.question}</h2>
            {question.type === "budget" && <p className="text-muted-foreground mt-0.5 text-xs">אפשר לשנות אחר כך בלחיצה אחת</p>}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {question.options.map((opt) => {
            const selected = answers[question.id] === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => selectAnswer(opt.value)}
                className={cn(
                  "group flex min-h-14 items-center justify-between gap-3 rounded-xl border px-4 py-3 text-start font-medium transition-all",
                  selected
                    ? "border-brand bg-brand/5 ring-brand/30 ring-2"
                    : "border-input bg-card hover:border-brand hover:bg-brand/5 hover:-translate-y-0.5 hover:shadow-md"
                )}
              >
                <span>{opt.label}</span>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                    selected ? "border-brand bg-brand text-brand-foreground" : "border-border text-transparent group-hover:border-brand group-hover:text-brand"
                  )}
                >
                  {selected ? <Check className="size-3.5" strokeWidth={3} /> : <ArrowLeft className="size-3.5" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between">
          {step > 0 ? (
            <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} className="gap-1.5">
              <ArrowRight className="size-4" /> השאלה הקודמת
            </Button>
          ) : (
            <span />
          )}
          {answers[question.id] && step + 1 < questions.length && (
            <Button variant="ghost" size="sm" onClick={() => setStep(step + 1)} className="gap-1.5">
              הבאה <ArrowLeft className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
