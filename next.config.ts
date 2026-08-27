import type { NextConfig } from "next";
import path from "node:path";

// Sent on every response. Each of these was absent, which a launch-readiness
// check picks up immediately — they cost nothing and close off whole classes
// of attack that need no bug on our side to work.
const SECURITY_HEADERS = [
  // Clickjacking: without this the checkout can be framed invisibly over
  // someone else's page and a customer's click aimed at whatever they like.
  { key: "X-Frame-Options", value: "DENY" },
  // Stops a browser second-guessing a Content-Type and executing something
  // we served as data.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Full URLs leak the search terms and product a customer was looking at to
  // every third-party host we link or load from. Origin-only on cross-origin,
  // full path within our own site where analytics needs it.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing on this site uses a camera, a microphone or geolocation, so no
  // embedded frame gets to ask for them in our name either.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  // Belt and braces with Vercel's own HSTS: two years, subdomains included.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    // img-src has to stay open to any https host: product photography comes
    // from dozens of uncontrolled manufacturer and importer domains, which is
    // the same reason images.unoptimized is on below.
    //
    // script-src carries 'unsafe-inline' because Next inlines the hydration
    // bootstrap, and locking that down properly means generating a per-request
    // nonce in middleware and threading it through. Worth doing, and not worth
    // shipping half-done: what is here already refuses a script from any
    // origin but our own, which is the half that stops an injected <script
    // src> cold. frame-ancestors, base-uri, form-action and object-src are
    // absolute — a page cannot be framed, a <base> tag cannot redirect our
    // relative URLs, a form cannot be retargeted to someone else's collector,
    // and no plugin content loads at all.
    value: [
      "default-src 'self'",
      "img-src 'self' data: blob: https:",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self' data:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "connect-src 'self' https:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Announcing the framework and its version to every visitor tells an
  // attacker which advisories to try first, and tells a customer nothing.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
  turbopack: {
    root: path.join(__dirname),
  },
  outputFileTracingRoot: path.join(__dirname),
  images: {
    remotePatterns: [
      // Product images increasingly come from wherever a manufacturer's own
      // site happens to host them (tradeinn.com, zabilo.com, gaggia.com,
      // melitta.de, faber-isr.com, ...) via the enrichment review flow —
      // there's no fixed small set of domains to allowlist in advance, and
      // every URL that reaches ProductImage.url already passed through an
      // admin approval step, so a broad https-only pattern is the right
      // tradeoff here rather than an ever-growing hardcoded list.
      {
        protocol: "https",
        hostname: "**",
      },
    ],
    // Vercel's own image optimizer fetches the source image from Vercel's
    // infrastructure, same as our own server-side URL checks do — so a host
    // that blocks datacenter/bot traffic (common hotlink protection on the
    // cheap hosting a lot of these manufacturer/reseller sites run on)
    // blocks the optimizer too, even though the exact same URL loads fine
    // for a real visitor's browser. That surfaces as a permanently broken
    // image (502 from /_next/image) on an otherwise perfectly real photo —
    // confirmed directly on a live product (lior-electric.co.il,
    // yarid-b.co.il both returned OPTIMIZED_EXTERNAL_IMAGE_REQUEST_UNAUTHORIZED
    // even though the same URL curls fine from outside Vercel). Given the
    // catalog pulls from dozens of uncontrolled third-party hosts with no
    // consistent bot policy, routing every image through the optimizer
    // trades reliability for a resize/format benefit that isn't worth a
    // silently-broken product photo. Unoptimized: the browser fetches the
    // original URL directly, matching what already got it validated.
    unoptimized: true,
  },
};

export default nextConfig;
