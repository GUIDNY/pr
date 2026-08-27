import type { MetadataRoute } from "next";

import { SITE_URL as BASE_URL } from "@/lib/site";

// Explicit allow for the AI crawlers that actually respect robots.txt
// (GPTBot, Google-Extended, PerplexityBot, ClaudeBot) rather than relying
// on the wildcard `*` rule alone — some of them are stricter than average
// bots about an unnamed disallow list, and being cited in an AI answer is
// exactly what the /articles content exists for.
export default function robots(): MetadataRoute.Robots {
  const disallow = ["/admin", "/api", "/account", "/cart", "/checkout"];
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow },
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
