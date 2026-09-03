import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // The shop moved to buytoday.co.il, and pr-ayam.vercel.app is still live:
  // Vercel always keeps that alias and it cannot be given up. Left alone it
  // is a second, complete copy of the shop at a different address — which is
  // how a domain move loses its search ranking, since Google has no way to
  // tell which of two identical sites is the real one. A 308 says the shop
  // moved permanently and hands the ranking to the new address.
  //
  // Everything except /pelecard/. Those two files — the payment page's
  // stylesheet and logo — are fetched by Pelecard from the origin their
  // support whitelisted by hand, which is still pr-ayam.vercel.app. A
  // redirect there sends them to an address that is not on their list, and
  // the failure is silent: no error, the payment page simply renders in
  // their default skin. See PELECARD_ASSET_ORIGIN in lib/pelecard/client.ts;
  // this exclusion comes out on the day they approve the new domain.
  //
  // Only the bare alias is matched. Preview deployments have their own
  // hostnames (pr-ayam-<hash>.vercel.app) and keep working untouched.
  async redirects() {
    return [
      {
        source: "/:path((?!pelecard/).*)",
        has: [{ type: "host", value: "pr-ayam.vercel.app" }],
        destination: "https://buytoday.co.il/:path",
        permanent: true,
      },
    ];
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
