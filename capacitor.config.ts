/* The iOS/Android shell around the shop.
 *
 * The app does NOT bundle the site. `server.url` points the WebView straight
 * at the live domain, and that is a deliberate choice rather than the default
 * one, for a reason that is invisible until everything is already broken:
 *
 * This shop runs on Server Actions — 23 files under src/actions/, covering the
 * cart, checkout, login, orders, favourites and addresses. Next protects them
 * with a CSRF check comparing the request's `Origin` header against `Host`.
 * A bundled Capacitor app serves its pages from `capacitor://localhost`, so
 * every Server Action it fires carries an Origin that does not match, and Next
 * rejects the lot. The failure has no symptom worth the name: the shop renders
 * perfectly, and no button does anything. Add-to-cart is silent, login is
 * silent, checkout is silent.
 *
 * Loading the real origin makes Origin === Host and the whole problem never
 * exists. The alternative — serverActions.allowedOrigins in next.config.ts —
 * weakens CSRF on a production storefront to solve a problem we do not need to
 * have.
 *
 * It also means `prec_session` (httpOnly, sameSite: lax — see src/lib/auth.ts)
 * behaves exactly as it does in a browser, and that content updates without
 * shipping a new build through App Review.
 */

/* Typed locally on purpose. tsconfig.json type-checks every .ts file in the
   repo, this one included, so importing CapacitorConfig from @capacitor/cli
   would make the production build on Vercel depend on a package that is only
   ever needed on the machine that assembles the app. Capacitor reads the
   default export and does not care where the type came from. */
type CapacitorConfig = {
  appId: string;
  appName: string;
  webDir: string;
  server?: {
    url?: string;
    androidScheme?: string;
    cleartext?: boolean;
    allowNavigation?: string[];
  };
  ios?: { contentInset?: string; limitsNavigationsToAppBoundDomains?: boolean };
};

const config: CapacitorConfig = {
  // Must match the App ID registered on the Apple Developer account. This is
  // the one value here that cannot be guessed from the codebase.
  appId: "il.co.buytoday.app",
  appName: "Buy Today",

  // Unused while server.url is set, but Capacitor requires the key to exist.
  webDir: "public",

  server: {
    // Not pr-ayam.vercel.app: next.config.ts 308s that host to buytoday.co.il,
    // so pointing here saves every request in the app a redirect.
    url: "https://buytoday.co.il",
    androidScheme: "https",
    cleartext: false,

    // Payment happens in an iframe (PaymentFrame in
    // src/app/(pay)/checkout/pay/[orderNumber]/page.tsx). These are the two
    // hosts from src/lib/pelecard/gateway.ts; without them a navigation to the
    // gateway can be handed to the system browser, which drops the customer
    // out of the app mid-purchase and loses the frame-return breakout.
    allowNavigation: ["gateway21.pelecard.biz", "gateway20.pelecard.biz"],
  },

  ios: {
    /* "never" lets the WebView run edge to edge, which puts the shop's sticky
       header behind the status bar and the Dynamic Island, and drops every
       bottom-pinned bar under the home indicator — the add-to-cart bar on a
       product page (mobile-buy-bar.tsx) among them.

       "always" hands the safe area to the scroll view, so the page is inset on
       both edges and `position: fixed` lands inside it. The alternative was
       viewport-fit=cover plus env(safe-area-inset-*) across the header, the
       buy bar, the compare tray and the cookie notice — a better-looking
       result that changes layout for every Safari visitor too, to fix
       something only the app has. */
    contentInset: "always",
    // Leave false. Turning it on restricts the WebView to declared app-bound
    // domains, which would block the Pelecard gateway and any 3-D Secure page
    // the customer's bank redirects the payment iframe to.
    limitsNavigationsToAppBoundDomains: false,
  },
};

export default config;
