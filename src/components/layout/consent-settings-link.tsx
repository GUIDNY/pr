"use client";

import { resetConsent, useConsent } from "@/lib/consent";

/**
 * Withdrawing, or granting, after the fact.
 *
 * A consent gate that cannot be reopened is not consent, it is a one-time
 * ambush — so this sits in the footer next to the privacy policy, on every
 * page. It clears the stored answer, which brings the banner back with both
 * buttons and (if the tags were running) reloads the page without them.
 *
 * It renders as a link rather than a button because that is what the rest of
 * the column is, and it says what the current answer is: someone looking for
 * this is usually looking to change something, and "אישרת מדידה ופרסום"
 * answers the question they came with before they click anything.
 */
export function ConsentSettingsLink() {
  const consent = useConsent();

  return (
    <button
      type="button"
      onClick={resetConsent}
      className="text-primary-foreground/60 hover:text-primary-foreground text-start text-sm underline-offset-2 hover:underline"
    >
      הגדרות פרטיות ועוגיות
      {consent === "granted" && <span className="sr-only"> — כרגע אישרת מדידה ופרסום</span>}
      {consent === "denied" && <span className="sr-only"> — כרגע לא אישרת מדידה ופרסום</span>}
    </button>
  );
}
