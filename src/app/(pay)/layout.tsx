import Link from "next/link";
import Image from "next/image";
import { Lock, ChevronRight } from "lucide-react";

/**
 * The shell for the payment step, and it is deliberately almost empty.
 *
 * The shop's own header carries a search box, eleven departments and a mega
 * menu that opens over whatever is beneath it — which on this page is the card
 * form. A customer who has decided to pay does not need a way to start browsing
 * again, and a menu that covers the field they are typing into is worse than
 * useless. Every checkout that works looks like this: the logo, so they know
 * where they are, the padlock, and a way back to the cart.
 *
 * The footer goes for the same reason. What is left of it — privacy,
 * accessibility, the phone number — is on the page itself, next to the form,
 * where somebody hesitating over a card number can actually see it.
 */
export default function PaymentLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <header className="border-border bg-background sticky top-0 z-40 border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link href="/" aria-label="A&I Electronics — לעמוד הבית" className="shrink-0">
            <Image
              src="/brand/logo.png"
              alt="A&I Electronics"
              width={120}
              height={120}
              className="h-10 w-auto"
              priority
            />
          </Link>

          <p className="text-muted-foreground flex items-center gap-1.5 text-sm font-medium">
            <Lock className="text-success size-4" aria-hidden />
            תשלום מאובטח
          </p>

          <Link
            href="/checkout"
            className="text-muted-foreground hover:text-foreground flex items-center gap-0.5 text-sm"
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
            חזרה
          </Link>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>
    </>
  );
}
