import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-url";

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
      /* Googlebot and Googlebot-Image by name, with rules identical to the
         wildcard above, because Merchant Center asked for them by name:
         eight of the twelve disapproved products cite "update the
         robots.txt file to include the user-agents Googlebot and
         Googlebot-Image".

         Strictly, both already match `*` and already resolve to these
         exact rules — Google picks the most specific group and falls back
         to the wildcard when there is none. Naming them changes no
         crawler's permissions by a single path. It is written out because
         a checker that reports their absence will go on reporting it, and
         an identical group costs nothing to state.

         Identical is the requirement, not a nicety. Adding a Googlebot
         group with a different disallow list would silently change what
         Google may crawl, which is the one way this edit could do harm.
         /api stays disallowed for them too — /feeds/ is where the Merchant
         Center feed lives, and it is not under /api for exactly this
         reason. */
      { userAgent: "Googlebot", allow: "/", disallow },
      { userAgent: "Googlebot-Image", allow: "/", disallow },
      { userAgent: "GPTBot", allow: "/", disallow },
      { userAgent: "Google-Extended", allow: "/", disallow },
      { userAgent: "PerplexityBot", allow: "/", disallow },
      { userAgent: "ClaudeBot", allow: "/", disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
