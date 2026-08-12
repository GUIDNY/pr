import Link from "next/link";
import { Refrigerator, Tv, WashingMachine, Sparkles, type LucideIcon } from "lucide-react";
import { FINDER_CATEGORIES } from "@/lib/finder-config";

const ICONS: Record<string, LucideIcon> = { Refrigerator, Tv, WashingMachine };

export const metadata = { title: "עזרו לי לבחור" };

export default function FinderLandingPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-center">
      <span className="bg-brand text-brand-foreground mx-auto mb-4 flex size-14 items-center justify-center rounded-full">
        <Sparkles className="size-6" />
      </span>
      <h1 className="text-3xl font-bold">לא בטוחים מה לבחור?</h1>
      <p className="text-muted-foreground mt-2">בחרו קטגוריה וענו על כמה שאלות קצרות — נמליץ לכם על המוצרים המתאימים ביותר</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {FINDER_CATEGORIES.map((c) => {
          const Icon = ICONS[c.icon] ?? Sparkles;
          return (
            <Link
              key={c.categorySlug}
              href={`/finder/${c.categorySlug}`}
              className="border-border bg-card hover:border-brand/40 hover:shadow-md flex flex-col items-center gap-3 rounded-xl border p-6 transition-all"
            >
              <span className="bg-brand/10 text-brand flex size-14 items-center justify-center rounded-full">
                <Icon className="size-7" strokeWidth={1.5} />
              </span>
              <span className="font-semibold">{c.title}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
