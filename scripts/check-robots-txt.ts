// Guards the robots.txt reader the image migration consults before fetching.
//
// Fixture-driven and offline: these are the two real files that made this
// necessary, plus the shapes that decide whether a parser is right or
// merely plausible. A mistake here is either a host we crawl after it said
// no, or hundreds of images we decline for no reason — and neither shows up
// in a build.
//
// Run: npm run check:robots
import { parseRobotsTxt, isAllowedByRules, OUR_AGENT_TOKEN } from "../src/lib/inventory/robots-txt";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return;
  console.log(`FAIL  ${name}${detail ? `  — ${detail}` : ""}`);
  failed++;
}

function allowed(txt: string, path: string, agent = "*"): boolean {
  const groups = parseRobotsTxt(txt);
  const rules =
    agent === "*"
      ? (groups.get("*") ?? [])
      : ([...groups].find(([a]) => a !== "*" && OUR_AGENT_TOKEN.includes(a))?.[1] ?? groups.get("*") ?? []);
  return isAllowedByRules(rules, path);
}

/* The real Electrolux media library: named groups for the search engines,
   each with an allowlist and a blanket disallow, and then the same blanket
   for everyone else. Our images sit under a hash path that is on nobody's
   allowlist. */
const ELECTROLUX = `
User-agent: Googlebot
Allow: /assets/
Allow: /asset/
Allow: /KWDzt7raQ5kLtT863PcZjYWVBJeb9MBh3nA5MhuJZvVcZ/
Disallow: /

User-agent: Googlebot-image
Allow: /assets/
Disallow: /

User-agent: *
Disallow: /
`;

check(
  "electrolux blanket disallow applies to us",
  !allowed(ELECTROLUX, "/QSu8d67YRKBWgMGtSXp0pUkaNBeOsuItrMl28Etj87QYT/view/x.jpg"),
);
/* The allowlists there belong to Googlebot and Googlebot-image, NOT to the
   wildcard group — so even /assets/ is closed to us. Worth asserting,
   because reading that file quickly gives the opposite impression and it is
   the difference between "fetch the allowed paths" and "fetch nothing". */
check("the Googlebot allowlist does not extend to us", !allowed(ELECTROLUX, "/assets/thing.jpg"));

/* Monitor Audio: one wildcard group, one path, and our file is under it. */
const MONITOR = `
User-Agent: *
Disallow: /site/assets/

User-agent: Yandexbot
Disallow: /
`;
check("monitor audio blocks the assets path", !allowed(MONITOR, "/site/assets/files/47368/mass.jpg"));
check("monitor audio allows everything else", allowed(MONITOR, "/products/mass-5-1"));

/* The common shape across this catalogue's hosts: forbid the back office,
   allow the pictures. Getting this wrong would decline hundreds of images
   that every host involved is happy to serve. */
const TYPICAL = `
User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /api/
Sitemap: https://example.com/sitemap.xml
`;
check("an ordinary shop robots.txt still allows images", allowed(TYPICAL, "/media/catalog/product/x.jpg"));
check("...and still blocks its admin", !allowed(TYPICAL, "/admin/login"));

// An empty Disallow is the explicit "no restrictions", not a block on "".
check("empty disallow allows everything", allowed("User-agent: *\nDisallow:\n", "/anything.jpg"));

// No rules at all, and a file that never mentions us.
check("a file with no wildcard group allows us", allowed("User-agent: Googlebot\nDisallow: /\n", "/x.jpg"));

// Longest match wins, and Allow beats Disallow at equal length — the two
// rules that decide most real files.
const NESTED = `
User-agent: *
Disallow: /media/
Allow: /media/catalog/
`;
check("a longer Allow overrides a shorter Disallow", allowed(NESTED, "/media/catalog/p.jpg"));
check("...without opening the rest of the tree", !allowed(NESTED, "/media/private/p.jpg"));

// Wildcards and the end-anchor.
check("a * in the middle matches", !allowed("User-agent: *\nDisallow: /*/private/\n", "/a/private/x.jpg"));
check("$ anchors the end", !allowed("User-agent: *\nDisallow: /*.pdf$\n", "/docs/a.pdf"));
check("$ does not match past the end", allowed("User-agent: *\nDisallow: /*.pdf$\n", "/docs/a.pdf.jpg"));

// Consecutive user-agent lines share one group.
const SHARED = `
User-agent: BuyTodayBot
User-agent: SomeOtherBot
Disallow: /nope/
`;
check("we obey a group that names us", !allowed(SHARED, "/nope/x.jpg", "us"));

// A group naming us wins over the wildcard, even a more permissive one.
const NAMED = `
User-agent: *
Disallow: /

User-agent: BuyTodayBot
Disallow: /secret/
`;
check("a group naming us replaces the wildcard", allowed(NAMED, "/images/x.jpg", "us"));
check("...and its own rules still apply", !allowed(NAMED, "/secret/x.jpg", "us"));

// Comments and odd casing must not change meaning.
check(
  "comments and casing are ignored",
  !allowed("# hello\nUSER-AGENT: *\nDISALLOW: /x/   # trailing\n", "/x/y.jpg"),
);

if (failed > 0) {
  console.log(`\n${failed} failed`);
  process.exit(1);
}
console.log("OK  robots.txt rules parsed and applied correctly");
process.exit(0);
