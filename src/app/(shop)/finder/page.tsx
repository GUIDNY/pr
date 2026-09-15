import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check, ListChecks, MousePointerClick, Sparkles } from "lucide-react";
import { getFinderCategoryCards } from "@/lib/queries/finder";
import { AskAlfredButton } from "@/components/finder/ask-alfred-button";

export const metadata = { title: "עזרו לי לבחור" };
export const revalidate = 300;

const STEPS = [
  { icon: MousePointerClick, title: "בוחרים מה מחפשים", body: "מקרר, טלוויזיה או מכונת כביסה" },
  { icon: ListChecks, title: "עונים על 2–4 שאלות", body: "תקציב, גודל הבית, העדפות. בלי מונחים טכניים" },
  { icon: Sparkles, title: "מקבלים המלצות", body: "רק דגמים במלאי, עם הסבר למה כל אחד מתאים" },
];

/**
 * The finder's front door. Alfred introduces the idea in a sentence, the
 * three product types are real photographs from the shelf with a live
 * count beside each, and anyone whose product is not one of the three has
 * the chat one tap away rather than a dead end.
 */
export default async function FinderLandingPage() {
  const cards = await getFinderCategoryCards();
  const total = cards.reduce((n, c) => n + c.productCount, 0);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 lg:py-12">
      <section className="bg-primary text-primary-foreground relative overflow-hidden rounded-3xl">
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 90% at 0% 50%, oklch(0.42 0.12 264 / 0.9), transparent), radial-gradient(ellipse 40% 60% at 100% 0%, oklch(0.658 0.209 39.1 / 0.25), transparent)",
          }}
        />
        <div className="relative grid items-center gap-6 px-6 py-8 sm:grid-cols-[1fr_auto] sm:px-10 sm:py-10">
          <div className="flex flex-col items-start gap-4">
            <span className="bg-primary-foreground/10 ring-primary-foreground/15 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1">
              <Sparkles className="text-brand size-3.5" />
              אלפרד, העוזר החכם של Buy Today
            </span>
            <h1 className="text-3xl leading-tight font-black text-balance sm:text-4xl">לא בטוחים מה לבחור?</h1>
            <p className="text-primary-foreground/80 max-w-lg text-base">
              כמה שאלות קצרות על הבית והתקציב, ואלפרד יסנן מתוך {total.toLocaleString("he-IL")} מוצרים במלאי את
              אלה שבאמת מתאימים לכם, עם הסבר למה.
            </p>
            <ul className="text-primary-foreground/85 flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {["חצי דקה", "רק מוצרים במלאי", "בלי התחייבות"].map((f) => (
                <li key={f} className="flex items-center gap-1.5">
                  <Check className="text-brand size-4" strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <Image
            src="/mascot/alfred.png"
            alt=""
            width={220}
            height={220}
            priority
            className="mx-auto size-40 object-contain object-top drop-shadow-[0_12px_24px_rgba(0,0,0,0.35)] sm:size-52"
          />
        </div>
      </section>

      <h2 className="mt-10 text-center text-xl font-bold sm:text-2xl">במה נעזור לכם היום?</h2>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.categorySlug}
            href={`/finder/${c.categorySlug}`}
            className="group bg-card hover:border-brand/40 relative flex flex-col overflow-hidden rounded-2xl border border-transparent shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgb(0_0_0/0.12),0_0_0_1px_rgb(0_0_0/0.05)]"
          >
            <div className="relative aspect-[4/3] w-full bg-white">
              {c.imageUrl ? (
                <Image
                  src={c.imageUrl}
                  alt=""
                  fill
                  sizes="(min-width: 640px) 320px, 100vw"
                  className="object-contain p-6 transition-transform duration-300 group-hover:scale-[1.04]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="bg-brand/5 absolute inset-0" />
              )}
            </div>
            <div className="flex items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-bold">{c.title}</p>
                <p className="text-muted-foreground text-xs">
                  {c.productCount.toLocaleString("he-IL")} דגמים במלאי · {c.questions.length} שאלות
                </p>
              </div>
              <span className="bg-brand text-brand-foreground flex size-9 shrink-0 items-center justify-center rounded-full transition-transform group-hover:-translate-x-1">
                <ArrowLeft className="size-4" />
              </span>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STEPS.map((s, i) => (
          <div key={s.title} className="flex items-start gap-3">
            <span className="bg-brand/10 text-brand flex size-10 shrink-0 items-center justify-center rounded-full">
              <s.icon className="size-5" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-bold">
                <span className="text-brand me-1.5 tabular-nums">{i + 1}.</span>
                {s.title}
              </p>
              <p className="text-muted-foreground text-sm">{s.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <AskAlfredButton className="w-full sm:w-auto">
          <span className="block font-bold">מחפשים משהו אחר?</span>
          <span className="text-muted-foreground block text-xs">כתבו לאלפרד בשפה חופשית: &quot;תנור בנוי עם טורבו עד 3,000 ₪&quot;</span>
        </AskAlfredButton>
        <Link href="/category" className="text-brand text-sm font-semibold underline-offset-4 hover:underline">
          או לכל המחלקות
        </Link>
      </div>
    </div>
  );
}
