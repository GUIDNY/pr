import Image from "next/image";
import Link from "next/link";
import { Heart, PackageCheck, Phone, ShieldCheck, Zap } from "lucide-react";
import { BUSINESS } from "@/lib/business";
import { cn } from "@/lib/utils";

const PERKS = [
  { icon: PackageCheck, title: "מעקב הזמנות", body: "כל הזמנה, המשלוח והאחריות במקום אחד" },
  { icon: Zap, title: "קופה מהירה", body: "הפרטים והכתובת שמורים, שתי לחיצות והזמנתם" },
  { icon: Heart, title: "מועדפים", body: "שומרים דגמים ומשווים ביניהם בנחת" },
  { icon: ShieldCheck, title: "יבואן רשמי", body: "אחריות אמיתית על כל מוצר, ושירות של בני אדם" },
];

/**
 * The frame around signing in and signing up.
 *
 * On a desktop the page is two halves: the shop's own navy panel — mark,
 * Alfred, the four reasons an account is worth having — beside the form,
 * so a sign-in page reached from an email link still says whose shop this
 * is, and a form is not a lone white card floating on grey. On a phone the
 * panel folds into a short band above the form.
 *
 * The two forms share this frame and a segmented switch between them, so
 * "no account yet?" is one tap at the top rather than a line to hunt for
 * under the button.
 */
export function AuthShell({ mode, children }: { mode: "login" | "register"; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-3 lg:py-10">
      <div className="lg:bg-card lg:overflow-hidden lg:rounded-3xl lg:shadow-[0_1px_2px_rgb(0_0_0/0.05),0_0_0_1px_rgb(0_0_0/0.05)] lg:grid lg:min-h-[560px] lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ---- the shop's panel: desktop only. On a phone the page is the
            form and nothing else — signing in should feel like a second,
            and a banner above it is a second it does not have. ---- */}
        <aside className="bg-primary text-primary-foreground relative hidden overflow-hidden lg:block">
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse 70% 80% at 100% 0%, oklch(0.42 0.12 264 / 0.9), transparent), radial-gradient(ellipse 50% 60% at 0% 100%, oklch(0.658 0.209 39.1 / 0.35), transparent)",
            }}
          />
          <div className="relative flex h-full flex-col justify-between p-9">
            <div className="flex items-center gap-3">
              <Image src="/brand/logo.png" alt="Buy Today" width={512} height={512} className="size-11 rounded-[22%]" />
              <div>
                <p className="text-lg leading-tight font-black">Buy Today</p>
                <p className="text-primary-foreground/70 text-xs">מוצרי חשמל · יבואן רשמי</p>
              </div>
            </div>
            <div className="my-8">
              <h2 className="text-3xl leading-tight font-black text-balance">
                {mode === "login" ? "טוב שחזרתם." : "חשבון אחד, כל הבית."}
              </h2>
              <p className="text-primary-foreground/80 mt-2 max-w-sm text-sm">
                {mode === "login"
                  ? "ההזמנות, המועדפים והפרטים שלכם מחכים בדיוק איפה שהשארתם אותם."
                  : "נרשמים פעם אחת, ומכאן כל הזמנה לוקחת שתי לחיצות."}
              </p>
              <ul className="mt-7 flex flex-col gap-4">
                {PERKS.map((p) => (
                  <li key={p.title} className="flex items-start gap-3">
                    <span className="bg-primary-foreground/10 ring-primary-foreground/15 flex size-9 shrink-0 items-center justify-center rounded-xl ring-1">
                      <p.icon className="text-brand size-4.5" strokeWidth={2} />
                    </span>
                    <span>
                      <span className="block text-sm font-bold">{p.title}</span>
                      <span className="text-primary-foreground/70 block text-xs">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex items-end justify-between gap-4">
              <p className="text-primary-foreground/70 text-xs">
                נתקעתם?{" "}
                <a href={BUSINESS.phoneHref} className="text-primary-foreground font-semibold hover:underline">
                  <Phone className="ms-1 inline size-3.5" />
                  {BUSINESS.phone}
                </a>
              </p>
              <Image src="/mascot/alfred.png" alt="" width={200} height={200} className="size-32 object-contain object-top drop-shadow-[0_10px_20px_rgba(0,0,0,0.35)]" />
            </div>
          </div>
        </aside>

        {/* ---- the form ---- */}
        <div className="flex flex-col py-2 sm:px-10 sm:py-8 lg:justify-center">
          <div className="mx-auto w-full max-w-md">
            {/* On a phone the mark sits small beside the switch; on a
                desktop the panel already carries it. */}
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <Image src="/brand/logo.png" alt="Buy Today" width={512} height={512} className="size-9 rounded-[22%]" />
              <p className="text-lg leading-tight font-black">{mode === "login" ? "ברוכים השבים" : "חשבון חדש"}</p>
            </div>
            <nav aria-label="התחברות או הרשמה" className="bg-muted mb-5 grid grid-cols-2 rounded-xl p-1 text-sm font-semibold">
              {(
                [
                  ["login", "התחברות", "/login"],
                  ["register", "הרשמה", "/register"],
                ] as const
              ).map(([key, label, href]) => (
                <Link
                  key={key}
                  href={href}
                  aria-current={mode === key ? "page" : undefined}
                  className={cn(
                    "rounded-lg py-2 text-center transition-colors",
                    mode === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
