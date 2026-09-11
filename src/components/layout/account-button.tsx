"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { useAccountName } from "@/components/layout/session-summary-provider";

/**
 * The account button, which now looks different depending on whether anyone
 * is signed in.
 *
 * It did not, and that was the whole problem. Signed in or signed out, the
 * header showed the same grey outline of a person; the only difference was a
 * first name in small text beside it, and that name was `hidden sm:inline` —
 * so on a phone there was no difference at all. A customer who had just
 * signed in could not tell that they had, which is worse than it sounds: not
 * knowing whether you are signed in is not knowing whether the cart you are
 * filling and the address you are typing belong to your account.
 *
 * So the state is carried by shape and colour, which survive being small,
 * and not by a word that gets hidden at the width where most people shop:
 *
 *   signed out — the outline icon, as before,
 *   signed in  — a filled brand-coloured disc with your initial in it, at
 *                every width, with the first name beside it where there is
 *                room for it.
 *
 * The initial is the part that matters. It is unmistakably different from
 * the outline at a glance and at any size, and it is also the thing that
 * says *which* account — a shared laptop is exactly where "am I signed in"
 * turns into "am I signed in as me".
 */
export function AccountButton() {
  const name = useAccountName();
  const first = name?.trim().split(" ")[0] ?? "";

  if (!first) {
    return (
      <Link
        href="/account"
        aria-label="התחברות או הרשמה"
        className="hover:bg-muted flex size-11 items-center justify-center rounded-full transition-colors sm:size-10"
      >
        <User className="size-5" />
      </Link>
    );
  }

  return (
    <Link
      href="/account"
      aria-label={`החשבון שלי — ${first}`}
      className="hover:bg-muted flex h-11 items-center gap-2 rounded-full px-1.5 transition-colors sm:h-10 sm:px-2"
    >
      <span
        aria-hidden
        className="bg-brand text-brand-foreground grid size-8 shrink-0 place-items-center rounded-full text-sm font-bold"
      >
        {first.charAt(0)}
      </span>
      <span className="hidden max-w-28 truncate pe-1 text-sm font-semibold sm:inline">{first}</span>
    </Link>
  );
}
