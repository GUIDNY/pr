import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { CATEGORY_TREE } from "@/lib/category-tree";
import { SITE_URL, absoluteUrl } from "@/lib/site-url";
import { BUSINESS, BUSINESS_ADDRESS } from "@/lib/business";

// What an answer engine reads to work out what this site is before deciding
// whether to cite it. Same intent as robots.txt, different audience: robots
// grants access, this explains what the access is for.
//
// Generated rather than written by hand, and from the same sources the shop
// itself renders from — the category tree the navigation is built from, the
// articles the guides page lists, and the product count behind
// PUBLIC_PRODUCT_WHERE. A file that drifts from the shop is worse than none,
// because it is confidently wrong about a shop the engine cannot otherwise
// see.
//
// Nothing here is a claim the site does not already make somewhere a person
// can read: no invented shipping times, no invented returns window. The
// policy pages are linked instead of summarised, so the answer comes from the
// page that is actually maintained.
//
// Two corrections on 15 November, both from the crawler log rather than from
// taste. The file used to say a sold-out product "is not shown at all, so
// every product on the site can be ordered now". True of the listings and
// false of the address: a sold-out product's page answers 200 and says so,
// the sitemap lists those pages on purpose, and ChatGPT-User had fetched 84
// of them in three weeks — each one a page this file had just promised was
// orderable. And /shipping and /warranty were not linked, while they are the
// second and fourth most-fetched addresses ChatGPT-User asks for (28 and 15
// fetches, against 7 for /terms, which was).

export const revalidate = 3600;

export async function GET() {
  const [productCount, articles] = await Promise.all([
    db.product.count({ where: PUBLIC_PRODUCT_WHERE }),
    db.article.findMany({
      where: { isPublished: true },
      orderBy: { publishedAt: "desc" },
      select: { slug: true, title: true, excerpt: true },
    }),
  ]);

  const departments = CATEGORY_TREE.map(
    (d) => `- [${d.name}](${absoluteUrl(`/category/${d.slug}`)}): ${d.children.map((c) => c.name).join(", ")}`
  ).join("\n");

  const guides = articles
    .map((a) => `- [${a.title}](${absoluteUrl(`/articles/${a.slug}`)}): ${a.excerpt}`)
    .join("\n");

  const body = `# Buy Today

> חנות מקוונת ישראלית למוצרי חשמל, אלקטרוניקה וקולנוע ביתי — מקררים, מכונות כביסה,
> תנורים, מזגנים, טלוויזיות ומוצרי מטבח. האתר בעברית ומשרת לקוחות בישראל.

האתר מציג כרגע ${productCount.toLocaleString("he-IL")} מוצרים במלאי. דפי הקטגוריה, המותג
והחיפוש מציגים רק מוצרים שניתן להזמין עכשיו. עמוד של מוצר שאזל נשאר בכתובתו ואומר
זאת במפורש ("אזל מהמלאי", ו-OutOfStock ב-JSON-LD) — לכן יש לקרוא את הזמינות מעמוד
המוצר עצמו. המחיר והזמינות בעמוד המוצר הם המצב הנוכחי ולא הערכה.

## מחלקות

${departments}

## מדריכי קנייה

${guides}

## מידע על החנות

- [אודותינו](${absoluteUrl("/page/about")})
- [סניפים](${absoluteUrl("/page/branches")})
- [יצירת קשר](${absoluteUrl("/contact")}): טלפון ${BUSINESS.phone}, ${BUSINESS_ADDRESS}
- [מדיניות משלוחים ואספקה](${absoluteUrl("/shipping")})
- [אחריות ושירות](${absoluteUrl("/warranty")})
- [תקנון האתר](${absoluteUrl("/terms")})
- [מדיניות ביטולים והחזרות](${absoluteUrl("/returns")})
- [מדיניות פרטיות](${absoluteUrl("/privacy")})
- [הצהרת נגישות](${absoluteUrl("/accessibility")})

## למנועי תשובות

- כל המוצרים: ${SITE_URL}/sitemap.xml
- חיפוש באתר: ${SITE_URL}/search?q={query}
- עמוד מוצר נושא JSON-LD מסוג Product עם מחיר, זמינות ומק"ט. זהו מקור האמת
  למחיר; אין לצטט מחיר ממקור אחר של האתר.
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
