import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function FinderTeaser() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-8">
      <div className="from-brand/10 to-brand/5 border-brand/20 relative overflow-hidden rounded-2xl border bg-gradient-to-l p-6 sm:p-10">
        <div className="relative flex flex-col items-start gap-4 sm:max-w-lg">
          <span className="bg-brand text-brand-foreground flex size-11 items-center justify-center rounded-full">
            <Sparkles className="size-5" />
          </span>
          <h2 className="text-2xl font-bold sm:text-3xl">לא בטוחים מה לבחור?</h2>
          <p className="text-muted-foreground">
            ענו על כמה שאלות קצרות ואנחנו נמליץ לכם על המוצרים המתאימים ביותר — עם הסבר אישי לכל המלצה.
          </p>
          <Button variant="brand" size="lg" asChild className="h-11 px-6">
            <Link href="/finder">
              בואו נתחיל
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
