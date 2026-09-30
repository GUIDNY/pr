import { MALL_CHECKOUT_FRAME_NAME } from "@/lib/mall";
export const metadata = { title: "מעבירים אתכם...", robots: { index: false } };
export const dynamic = "force-dynamic";

/**
 * Where Pelecard sends the customer's browser when the payment is done.
 *
 * It exists because the form is in a frame. Their page redirects the window it
 * is in, which is the frame — so without this the confirmation page would open
 * *inside* the payment box, complete with a second copy of the site's header,
 * and the customer would be looking at a shop inside a shop.
 *
 * All this does is put the whole window back where it belongs. The redirect is
 * the first thing that runs and it needs no styling of its own: nobody is meant
 * to see this page, and if the script cannot run the server redirect below
 * still moves the frame to the right place rather than leaving a blank box.
 */
const DESTINATIONS = {
  success: (order: string) => `/checkout/success/${encodeURIComponent(order)}`,
  error: (order: string) => `/checkout/error?order=${encodeURIComponent(order)}`,
  cancelled: (order: string) => `/checkout/cancelled?order=${encodeURIComponent(order)}`,
} as const;

export default async function FrameReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; order?: string }>;
}) {
  const { to, order } = await searchParams;
  const destination =
    DESTINATIONS[(to ?? "") as keyof typeof DESTINATIONS]?.(order ?? "") ?? "/checkout";

  return (
    <>
      <script
        // Runs before anything renders. `top` is the customer's actual window;
        // inside a frame this is the whole point, and outside one it is simply
        // this window, so the same line is correct in both flows.
        dangerouslySetInnerHTML={{
          // In the 3D mall's checkout the "whole window" is the game's
          // checkout frame, not the game: climb to it while the ancestors are
          // this site (reading a cross-origin one's name throws, which ends
          // the climb at the top).
          __html: `(function(d){var w=window.top;try{var f=window;while(f!==window.top){if(f.name===${JSON.stringify(
            MALL_CHECKOUT_FRAME_NAME,
          )}){w=f;break}f=f.parent}}catch(e){}try{w.location.replace(d)}catch(e){window.location.replace(d)}})(${JSON.stringify(destination)})`,
        }}
      />
      <noscript>
        <meta httpEquiv="refresh" content={`0;url=${destination}`} />
      </noscript>
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="font-semibold">מעבירים אתכם לסיום ההזמנה...</p>
        <a href={destination} target="_top" className="text-brand underline underline-offset-2">
          אם העמוד לא נטען מעצמו — לחצו כאן
        </a>
      </div>
    </>
  );
}
