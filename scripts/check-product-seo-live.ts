/**
 * What a crawler gets from a product page, checked from outside.
 *
 * Three things, on one live product page, fetched with no cookies the way
 * Googlebot fetches it: no robots tag (or an indexing one), a canonical
 * that points at the page's own URL, and a title that is the product's name
 * rather than the site's fallback. Plus the structured data: a Product
 * JSON-LD block with an offer and at least one additionalProperty row.
 *
 * It exists because every one of those can be lost without a build
 * failing: a cookies() or headers() call added somewhere in the tree makes
 * the route dynamic, generateMetadata returning {} on a product that is
 * actually live leaves the page titled "Buy Today", and a proxy rule that
 * rewrites /product/ for the wrong cookie sends visitors to the noindex
 * preview. None of that is visible in the admin, and the symptom in Search
 * Console arrives weeks later.
 *
 * Network only, no database. The product is the first one in the sitemap
 * unless a slug is given.
 *
 *   npm run check:seo                      — against https://buytoday.co.il
 *   npm run check:seo -- <slug>            — a specific product
 *   SITE=https://preview.example npm run check:seo
 */

const SITE = (process.env.SITE ?? "https://buytoday.co.il").replace(/\/$/, "");

let failures = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok || !detail ? "" : `\n          ${detail}`}`);
  if (!ok) failures++;
}

async function fetchText(url: string): Promise<{ status: number; body: string; headers: Headers }> {
  const res = await fetch(url, {
    redirect: "manual",
    headers: {
      // A browser's accept header and nothing a browser would not send; in
      // particular no cookie, which is how every search crawler arrives.
      accept: "text/html,application/xhtml+xml",
      "user-agent": "Mozilla/5.0 (compatible; buytoday-seo-check/1.0)",
    },
  });
  return { status: res.status, body: await res.text(), headers: res.headers };
}

async function firstProductSlug(): Promise<string | null> {
  const { body } = await fetchText(`${SITE}/sitemap.xml`);
  const match = body.match(/<loc>[^<]*\/product\/([^<]+)<\/loc>/);
  return match ? match[1] : null;
}

async function main() {
  const slug = process.argv[2] ?? (await firstProductSlug());
  if (!slug) {
    console.log("  FAIL  no product URL found in the sitemap");
    process.exit(1);
  }
  const url = `${SITE}/product/${slug}`;
  console.log(`\n${url}\n`);
  const { status, body, headers } = await fetchText(url);

  check("answers 200", status === 200, `status ${status}`);

  const robots = body.match(/<meta name="robots" content="([^"]*)"/)?.[1] ?? null;
  check("no noindex", robots === null || !/noindex/.test(robots), `robots: ${robots}`);
  check("no nofollow", robots === null || !/nofollow/.test(robots), `robots: ${robots}`);

  const canonical = body.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null;
  check("canonical present", canonical !== null);
  check("canonical is this page", canonical === url, `canonical: ${canonical}`);

  const title = body.match(/<title>([^<]*)<\/title>/)?.[1]?.trim() ?? "";
  check("title is the product's name", title.length > 0 && !/^Buy Today - /.test(title), `title: ${title}`);
  check("title names the slug's product", title.includes("|") && !title.startsWith("Buy Today"), `title: ${title}`);

  const blocks = [...body.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  const product = blocks
    .map((b) => {
      try {
        return JSON.parse(b) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .find((d) => d && d["@type"] === "Product");
  check("Product JSON-LD present", !!product);
  if (product) {
    const offers = product.offers as Record<string, unknown> | undefined;
    check("offer has a price", typeof offers?.price === "string" && Number(offers.price) > 0);
    const props = product.additionalProperty as unknown[] | undefined;
    check("at least one additionalProperty row", Array.isArray(props) && props.length > 0, `rows: ${props?.length ?? 0}`);
    if (Array.isArray(props)) {
      const names = props.map((p) => String((p as { name: string }).name).replace(/["'״׳]/g, "").trim());
      check("no duplicate spec labels", new Set(names).size === names.length);
    }
  }

  check("served from the prerender", headers.get("x-nextjs-prerender") === "1", `x-nextjs-prerender: ${headers.get("x-nextjs-prerender")}`);

  console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("  FAIL  ", (error as Error).message);
  process.exit(1);
});
