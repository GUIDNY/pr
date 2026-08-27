import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
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
