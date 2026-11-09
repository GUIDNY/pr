import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MailX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyUnsubscribe, withdrawMarketingConsent } from "@/lib/marketing-consent";

export const metadata: Metadata = { title: "הסרה מרשימת הדיוור", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * The refusal link at the foot of every advertisement (lib/marketing-consent).
 *
 * A button and not a bare GET: mail providers and link scanners open every
 * link in a message to check it, and a GET that unsubscribed would remove
 * people who never asked to be removed. One press, no sign-in, no reason
 * asked — the law wants refusal easy, and it is.
 */
async function unsubscribe(formData: FormData) {
  "use server";
  const email = verifyUnsubscribe(String(formData.get("e") ?? ""), String(formData.get("t") ?? ""));
  if (!email) redirect("/unsubscribe?bad=1");
  await withdrawMarketingConsent(email);
  redirect("/unsubscribe?done=1");
}

export default async function UnsubscribePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const email = verifyUnsubscribe(sp.e, sp.t);
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <MailX className="text-muted-foreground size-12" />
      {sp.done ? (
        <>
          <h1 className="text-2xl font-bold">הוסרתם מרשימת הדיוור</h1>
          <p className="text-muted-foreground">לא נשלח אליכם יותר פרסום. הודעות על הזמנות שתבצעו ימשיכו להגיע כרגיל.</p>
        </>
      ) : email ? (
        <>
          <h1 className="text-2xl font-bold">הסרה מרשימת הדיוור</h1>
          <p className="text-muted-foreground">
            הכתובת <b dir="ltr">{email}</b> לא תקבל מאיתנו יותר מבצעים ופרסומות — לא במייל ולא בוואטסאפ.
          </p>
          <form action={unsubscribe}>
            <input type="hidden" name="e" value={sp.e} />
            <input type="hidden" name="t" value={sp.t} />
            <Button type="submit" variant="brand" size="lg">
              הסירו אותי
            </Button>
          </form>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-bold">הקישור לא תקין</h1>
          <p className="text-muted-foreground">
            אפשר לבטל קבלת פרסומות באזור האישי, או להשיב &quot;הסר&quot; לכל הודעה שקיבלתם מאיתנו ונטפל בזה מיד.
          </p>
        </>
      )}
    </div>
  );
}
