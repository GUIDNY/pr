"use client";

import { resetConsent, useConsent } from "@/lib/consent";
import { useIsNativeApp } from "@/lib/native-app";

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

  /* Absent inside the iOS app, together with the bar it reopens.
   *
   * There is nothing to settle there: the app loads no measurement tag at all
   * (see cookie-notice.tsx for why, and what App Review said about it), so a
   * link offering to change a choice nobody was asked to make would be the
   * same misdescription in a quieter place — and it is the one place a
   * reviewer looking for a cookie prompt would go next.
   *
   * It renders its own <li> so that hiding it removes the whole row rather
   * than leaving a blank one in the footer's list. */
  const inApp = useIsNativeApp();
  if (inApp) return null;

  return (
    <li>
      <button
        type="button"
        onClick={resetConsent}
        className="text-primary-foreground/60 hover:text-primary-foreground text-start text-sm underline-offset-2 hover:underline"
      >
        הגדרות פרטיות ועוגיות
        {consent === "granted" && (
          <span className="sr-only"> — כרגע אישרת מדידה ופרסום</span>
        )}
        {consent === "denied" && (
          <span className="sr-only"> — כרגע לא אישרת מדידה ופרסום</span>
        )}
      </button>
    </li>
  );
}
