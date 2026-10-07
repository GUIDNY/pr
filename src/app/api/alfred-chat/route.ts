import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { searchForChat, type ChatSearchOptions } from "@/lib/queries/products";
import { resolveIntent, type BrandRef, type ShoppingIntent } from "@/lib/alfred/intent";
import { getChatbotSettings } from "@/lib/queries/chatbot-settings";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { gameCorsHeaders, gamePreflight } from "@/lib/game-api";
import { GAME_ORIGIN } from "@/lib/game-profile";

// Public-facing chat endpoint behind the "Alfred" widget — no bearer auth
// (unlike /api/integrations/*, which are for trusted external agents, not
// site visitors). Stateless: the client resends recent history each turn,
// there's no server-side conversation storage for v1.
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3.6-flash";

/* The model tried once when the primary answers 503/429 twice in a row.
 *
 * Not a name written here: the first version of this said
 * "gemini-3.6-flash-lite", Google answered 404, and a customer who had
 * already waited through two 503s got the same error as before. Model
 * names are Google's to change, so the fallback is read from Google's own
 * ListModels when it is needed: another "flash" model that supports
 * streaming, lighter ("lite") first, then anything else in the family.
 * Cached per warm instance for an hour. GEMINI_FALLBACK_MODEL in Vercel
 * overrides the choice; an empty value disables the fallback. */
let fallbackCache: { at: number; models: string[] } | null = null;
async function discoverFallbackModels(apiKey: string): Promise<string[]> {
  if (fallbackCache && Date.now() - fallbackCache.at < 60 * 60 * 1000) return fallbackCache.models;
  let models: string[] = [];
  try {
    const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=200", {
      headers: { "X-goog-api-key": apiKey },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const json = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
      const all = (json.models ?? [])
        .filter((m) => {
          const methods = m.supportedGenerationMethods ?? [];
          return methods.length === 0 || methods.includes("generateContent") || methods.includes("streamGenerateContent");
        })
        .map((m) => (m.name ?? "").replace(/^models\//, ""))
        .filter((n) => n && n !== GEMINI_MODEL && !/tts|image|audio|live|embedding|veo|imagen|aqa/i.test(n));
      /* Strict first — a stable flash sibling — then anything flash, then
         anything at all that answers text. A preview model is a worse
         fallback than a stable one and a better one than an error. */
      const tiers = [
        all.filter((n) => /flash/i.test(n) && !/preview|exp/i.test(n)),
        all.filter((n) => /flash/i.test(n)),
        all,
      ];
      const names = tiers.find((t) => t.length > 0) ?? [];
      const rank = (n: string) => (/lite/i.test(n) ? 0 : 1) * 1000 - (parseFloat(n.match(/(\d+(?:\.\d+)?)/)?.[1] ?? "0") || 0);
      /* Three, spread across families: when a 503 is the project being
         throttled rather than one model being busy, the lite sibling of
         the same generation is throttled with it, and an older generation
         is the one that answers. */
      const sorted = names.sort((a, b) => rank(a) - rank(b));
      const families = new Set<string>();
      models = sorted.filter((n) => {
        const family = n.match(/^gemini-(\d+(?:\.\d+)?)/)?.[1] ?? n;
        if (families.has(family)) return false;
        families.add(family);
        return true;
      }).slice(0, 3);
      console.warn(
        `[alfred] fallback models from ListModels: ${models.join(", ") || "none"} (${names.length} candidates of ${all.length} text models; sample: ${all.slice(0, 12).join(", ")})`,
      );
    } else {
      console.error(`[alfred] ListModels ${res.status}`);
    }
  } catch (error) {
    console.error("[alfred] ListModels failed:", (error as Error).message);
  }
  fallbackCache = { at: Date.now(), models };
  return models;
}
const MAX_HISTORY_TURNS = 10;
const MAX_MESSAGE_LENGTH = 1000;

/* Generous for a person and impossible for a loop. A real conversation is
   five or six messages; somebody comparing three fridges might reach twenty.
   Nobody types sixty questions in half an hour, so this is invisible to
   every customer and immediate for a script. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 30 * 60 * 1000;

type ChatTurn = { role: "user" | "model"; text: string };

type SearchResult = Awaited<ReturnType<typeof searchForChat>>;
const EMPTY_SEARCH: SearchResult = { products: [], spread: [], totalMatches: 0 };

/* The brand names, for reading "בוש" or "samsung" out of a message. A
   hundred and fifty short rows; refreshed every ten minutes per warm
   instance rather than on every message. */
let brandCache: { at: number; brands: BrandRef[] } | null = null;
async function listBrands(): Promise<BrandRef[]> {
  if (brandCache && Date.now() - brandCache.at < 10 * 60 * 1000) return brandCache.brands;
  const brands = await db.brand.findMany({ select: { name: true } });
  brandCache = { at: Date.now(), brands };
  return brands;
}

/* The search, then the honest fallbacks.
 *
 * A customer with ₪1,500 for a projector whose cheapest is ₪1,990 should
 * hear "the cheapest we have is ₪1,990", not "we have nothing" — so a
 * budget that empties the shelf is lifted and the model is told. A brand
 * the shop does not carry in that category is handled the same way: the
 * category's other brands, with a note saying so. */
async function searchLadder(intent: ShoppingIntent): Promise<{ result: SearchResult; notes: string[] }> {
  const base: ChatSearchOptions = {
    limit: 6,
    categorySlugs: intent.categorySlugs,
    brandNames: intent.brandNames,
    sort: intent.sort ?? undefined,
  };
  const scoped = intent.categorySlugs.length > 0 || intent.brandNames.length > 0;
  const notes: string[] = [];
  const words = [...intent.phraseWords, ...intent.words].slice(0, 6);

  let result = await searchForChat(words, { ...base, maxPrice: intent.maxPrice ?? undefined });
  if (result.products.length === 0 && scoped && intent.maxPrice !== null) {
    result = await searchForChat(words, { ...base, sort: "cheapest" });
    if (result.products.length > 0) {
      notes.push(
        `הערה: אין אף דגם עד ${intent.maxPrice}₪ בתחום הזה. הרשימה למעלה היא הדגמים הזולים ביותר שיש, מעל התקציב — אומרים את זה ללקוח בכנות ונוקבים במחיר הזול ביותר.`
      );
    }
  }
  if (result.products.length === 0 && intent.brandNames.length > 0 && intent.categorySlugs.length > 0) {
    result = await searchForChat(words, {
      ...base,
      brandNames: [],
      maxPrice: intent.maxPrice ?? undefined,
    });
    if (result.products.length > 0) {
      notes.push(
        `הערה: אין דגמים של ${intent.brandLabel} בקטגוריה הזו. הרשימה למעלה היא ממותגים אחרים — אומרים את זה ללקוח לפני שמציעים אותם.`
      );
    }
  }
  return { result, notes };
}

// The shipping/warranty/hours facts are NOT hardcoded here — they come
// live from ChatbotSettings (editable at /admin/chatbot) on every request,
// so an admin correcting a policy takes effect immediately with no deploy.
function buildPersona(settings: {
  shippingInfo: string;
  warrantyInfo: string;
  serviceHours: string | null;
  additionalNotes: string | null;
}): string {
  const lines = [
    `את/ה "אלפרד" — עוזר שירות הלקוחות של Buy Today, חנות אלקטרוניקה ומוצרי חשמל ישראלית מקוונת.`,
    `מדברים בעברית בלבד, בטון חם, אישי וקצר — כמו נציג שירות אנושי טוב, לא כמו רובוט. 2-4 משפטים לתשובה, לא יותר, אלא אם ממש נדרש יותר.`,
    `עוזרים ללקוחות למצוא מוצרים, עונים על שאלות משלוח/אחריות/תשלום, ומכוונים באתר.`,
    /* How a salesperson works, written down, because the model will not
       improvise it.
       "אני רוצה מקרר חדש לבית" got a paragraph explaining that the shop
       stocks office fridges and mini-bars — no question back, no product
       anybody would buy. A person behind a counter asks one thing: freezer
       on top or bottom, how big, what are you spending. Then they walk you
       to a specific machine. */
    `איך עונים כשמישהו מחפש מוצר:`,
    `— בקטגוריה גדולה (עשרות דגמים מכמה סוגים), לפני שממליצים על דגם צריך לדעת לפחות שניים מהשלושה: איזה סוג/תצורה, איזה גודל או נפח, ומה התקציב. כל עוד לא יודעים שניים — שואלים, לא ממליצים.`,
    /* The rule above is for a fridge department of 222. Pointed at a shelf
       of two projectors it produced a clarifying question about a choice
       that does not exist, and then — handed six soundbars — a denial that
       the shelf exists at all. */
    `— אם זוהתה קטגוריה והרשימה מסומנת "הרשימה המלאה" (קטגוריה קטנה) — לא שואלים שאלות בירור. מציגים את הדגמים שיש בשמם המלא ובמחירם, ואומרים איזה מהם מתאים לבקשה ולתקציב.`,
    `— כשהלקוח מבקש את הזול ביותר, היקר ביותר או הנמכר ביותר — הרשימה כבר ממוינת לפי זה והדגם הראשון הוא התשובה. נוקבים בו מיד בשם המלא ובמחיר, בלי בירור. אם הוא מסוג צדדי ביחס לבקשה (למשל מקרר משרדי קטן כשביקשו "מקרר") — אומרים זאת במשפט ושואלים אם התכוונו לזה או למקרר ביתי מלא.`,
    `— אסור לטעון שאין בחנות מוצרים מתחום שמופיע ב"מה שיש בחנות בפועל". אם זוהתה קטגוריה — יש בה מוצרים והם ברשימה; עונים עליהם.`,
    `— שאלה אחת בכל פעם. משפט קצר ואז השאלה, עם 2-3 אפשרויות קונקרטיות מתוך פירוט הקטגוריות (כמה דגמים יש מכל סוג ומאיזה מחיר) כדי שיהיה קל לענות.`,
    `— כששואלים שאלה מכוונת — אל תזכיר שום דגם ספציפי בשם. זה שלב הבירור, לא שלב ההצעה. מוכר טוב לא שם ארבעה מקררים על הדלפק כששאל "איזה סוג חיפשת".`,
    `— רק כשיש מספיק מידע: ממליצים על 1-2 דגמים בשם המלא (כולל קוד הדגם) ובמחיר, ולכל אחד משפט אחד שמסביר למה דווקא הוא מתאים למה שהלקוח ביקש — מתוך התיאור שניתן לך.`,
    `— אם הלקוח כבר אמר מה הוא צריך ואין צורך לברר עוד — אל תשאל סתם עוד שאלה, תמליץ.`,
    /* Named field by field, because the general version was not enough.
       Asked to compare two fridges it had only titles and prices for, the
       model answered that the LG "comes with InstaView smart double-door
       technology" — a real feature of some LG fridges, invented for this
       one out of the model name. A wrong spec on a shop page is a customer
       ordering something other than what they saw, so the rule says what is
       known rather than what is forbidden: a list can be checked against, a
       prohibition has to be interpreted.
       The description is now part of what is known, which is what makes the
       difference between answering "does it make ice" and deflecting it. */
    `כלל ברזל: כל מה שאתה יודע על מוצר הוא מה שכתוב בשורה שלו בהקשר הפנימי — שם, מותג, מחיר, סטטוס מלאי ותיאור. מותר לסכם ולצטט מהתיאור, וזו הדרך הנכונה לענות על שאלות כמו "יש לו מתקן קרח?" או "כמה ליטר?".`,
    `אם התיאור לא אומר את מה שנשאלת — אומרים את זה במפורש ("בתיאור של הדגם הזה לא מצוין…") ומפנים לעמוד המוצר. אסור להוסיף תכונה שלא כתובה, ואסור להסיק אותה משם הדגם או מהמותג.`,
    `אסור להמציא מחיר או זמינות שלא ניתנו בהקשר.`,
    /* Ten rows cannot stand for 222 products, and a model handed ten will
       describe the ten. This is the sentence that stops it telling a
       customer the shop is smaller than it is. */
    `כשמדברים על מה שיש בחנות — מסתמכים על פירוט הקטגוריות, לא על רשימת המוצרים. רשימת המוצרים היא רק דוגמאות שנבחרו לשאלה הזו, אף פעם לא כל מה שיש.`,
    `משלוח: ${settings.shippingInfo}`,
    `אחריות: ${settings.warrantyInfo}`,
  ];
  if (settings.serviceHours) lines.push(`שעות שירות: ${settings.serviceHours}`);
  if (settings.additionalNotes) lines.push(`מידע נוסף חשוב: ${settings.additionalNotes}`);
  lines.push(`אם שואלים על הזמנה אישית ספציפית (סטטוס, זיכוי וכו') — מסבירים שאין גישה לזה כרגע ומפנים ליצירת קשר עם הצוות.`);
  return lines.join("\n");
}

/* The same Alfred, also in the 3D mall.
 *
 * The game at play.buytoday.co.il talks to this endpoint as a sales rep standing
 * next to the player: same persona, same live settings, same search. It is
 * another origin, so it gets CORS — naming exactly the game's origin, as every
 * /api/game/* route does. Inside the app the game is served from /mall on this
 * host and needs none. Nothing here is personal, so no credentials are read;
 * the rate limit applies the same to both. */
function mallPersona(place: string | null): string {
  return [
    `הפעם אתה מדבר עם הלקוח מתוך הקניון התלת־ממדי של BuyToday: אתה הנציג שעומד לידו בקניון, עם אותו ידע ואותם כללים בדיוק.`,
    place ? `הלקוח נמצא עכשיו ב${place === "לובי" ? "לובי של הקניון" : `מחלקת ${place}`}.` : ``,
    `המוצרים בקניון הם המוצרים האמיתיים של האתר, באותם מחירים, ואפשר לקנות אותם ישר מהקניון ("קנה עכשיו" בכרטיס המוצר או "לעגלה").`,
  ].filter(Boolean).join("\n");
}

export function OPTIONS() {
  return gamePreflight("POST, OPTIONS");
}

export async function POST(request: Request) {
  const res = await answer(request);
  if (request.headers.get("origin") === GAME_ORIGIN) {
    for (const [k, v] of Object.entries(gameCorsHeaders())) res.headers.set(k, v);
  }
  return res;
}

/* Where in the mall the customer is talking from: a department's name, never
   free text — anything else is dropped, so the game cannot be used to write
   instructions into the prompt. Hebrew letters, spaces and a few punctuation
   marks, forty characters at most, is every department name there is. */
const MALL_PLACE = /^[\u0590-\u05FF ,'"\u05BE\u05F3\u05F4·-]{1,40}$/;

async function answer(request: Request): Promise<Response> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "הצ'אט לא זמין כרגע" }, { status: 503 });
  }

  /* Before anything expensive: the database reads below and the Gemini call
     after them both cost something, and neither should be spent on a caller
     who has already had their turn. */
  const limit = rateLimit(`alfred:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "שלחתם הרבה הודעות בזמן קצר. אפשר להמשיך בעוד כמה דקות, או להתקשר אלינו." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const record = body as { message?: unknown; history?: unknown; pinnedProductIds?: unknown; pinnedSlugs?: unknown; channel?: unknown; mallPlace?: unknown };
  const fromMall = record.channel === "mall";
  const mallPlace = fromMall && typeof record.mallPlace === "string" && MALL_PLACE.test(record.mallPlace) ? record.mallPlace : null;
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!message) return NextResponse.json({ error: "empty message" }, { status: 400 });
  if (message.length > MAX_MESSAGE_LENGTH) return NextResponse.json({ error: "ההודעה ארוכה מדי" }, { status: 400 });

  const history: ChatTurn[] = Array.isArray(record.history)
    ? record.history.filter(
        (h): h is ChatTurn => !!h && (h.role === "user" || h.role === "model") && typeof h.text === "string"
      )
    : [];

  // Optional: products the client is already showing on screen (e.g. the
  // homepage "אלפרד ממליץ" widget) — pinned into context regardless of
  // whether the user's own wording would search-match them, so Alfred can
  // answer "מה ההנחה על הראשון?" without the product name appearing in the
  // question at all.
  const pinnedIds: string[] = Array.isArray(record.pinnedProductIds)
    ? record.pinnedProductIds.filter((x): x is string => typeof x === "string").slice(0, 5)
    : [];
  // The mall knows its products by slug: the one the customer is standing next to.
  const pinnedSlugs: string[] = Array.isArray(record.pinnedSlugs)
    ? record.pinnedSlugs.filter((x): x is string => typeof x === "string" && /^[a-z0-9-]{1,120}$/.test(x)).slice(0, 3)
    : [];

  /* What is the customer shopping for? Decided before any query runs — see
     lib/alfred/intent.ts for why a substring search could not be trusted
     with that question. The customer's own turns only, newest first; the
     model's replies are never read back, so one wrong guess cannot feed
     itself. */
  const userMessages = [message, ...history.filter((h) => h.role === "user").map((h) => h.text).reverse()].slice(0, 6);
  const intent = resolveIntent({ userMessages, brands: await listBrands() });
  const hasTarget = intent.categorySlugs.length > 0 || intent.brandNames.length > 0 || intent.words.length > 0;

  const [search, settings, pinnedRows] = await Promise.all([
    hasTarget ? searchLadder(intent) : Promise.resolve({ result: EMPTY_SEARCH, notes: [] as string[] }),
    getChatbotSettings(),
    pinnedIds.length > 0 || pinnedSlugs.length > 0
      ? db.product.findMany({
          where: { OR: [{ id: { in: pinnedIds } }, { slug: { in: pinnedSlugs } }], ...PUBLIC_PRODUCT_WHERE },
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            stockStatus: true,
            brand: { select: { name: true } },
            images: { take: 1, orderBy: { sortOrder: "asc" }, select: { url: true } },
          },
        })
      : Promise.resolve([]),
  ]);

  const pinnedProducts = [...pinnedIds.map((id) => pinnedRows.find((r) => r.id === id)), ...pinnedSlugs.map((sl) => pinnedRows.find((r) => r.slug === sl))]
    .filter((r): r is NonNullable<typeof r> => !!r)
    .map((r) => ({
      title: r.title,
      slug: r.slug,
      price: r.price,
      brandName: r.brand.name,
      stockStatus: r.stockStatus,
      imageUrl: r.images[0]?.url ?? null,
    }));

  const pinnedContext =
    pinnedProducts.length > 0
      ? (fromMall
          ? "המוצר שהלקוח עומד לידו עכשיו בקניון (אם הוא שואל על \"זה\" או \"המוצר הזה\" — זה המוצר):\n"
          : "מוצרים שמוצגים ללקוח כרגע על המסך בווידג'ט 'אלפרד ממליץ' (הכי רלוונטיים לשיחה הזו):\n") +
        pinnedProducts
          .map((p) => `- ${p.title} | מותג: ${p.brandName} | מחיר: ${p.price}₪ | סטטוס מלאי: ${p.stockStatus}`)
          .join("\n")
      : "";

  /* What was understood, in plain words, so the model answers the question
     that was asked — "the cheapest fridge" is a sort inside a category, not
     a paragraph about fridges in general. */
  const understood = [
    intent.categoryLabel ? `קטגוריה: ${intent.categoryLabel}` : null,
    intent.brandLabel ? `מותג: ${intent.brandLabel}` : null,
    intent.maxPrice !== null ? `תקציב: עד ${intent.maxPrice}₪` : null,
    intent.sort === "cheapest"
      ? "מיון מבוקש: הזול ביותר (הרשימה ממוינת מהזול ליקר, הראשון הוא הזול ביותר)"
      : intent.sort === "priciest"
        ? "מיון מבוקש: היקר/המשובח ביותר (הרשימה ממוינת מהיקר לזול)"
        : intent.sort === "popular"
          ? "מיון מבוקש: הנמכרים/המומלצים ביותר (הרשימה ממוינת לפי פופולריות)"
          : null,
  ].filter(Boolean);
  const intentContext =
    understood.length > 0 ? `מה הובן מהבקשה של הלקוח (זוהה מהמילים שלו): ${understood.join(" · ")}` : "";

  /* What the shop really holds for this question — the part that lets Alfred
     ask "which kind?" instead of describing whichever ten rows came back.
     Without it a model handed ten products says the shop has ten products'
     worth of range, which is how a customer asking for a fridge was told
     this shop sells mini-bars. */
  const spreadContext =
    search.result.spread.length > 0
      ? `מה שיש בחנות בפועל בתחום שנשאל (זה המקור היחיד לתיאור המגוון — סה"כ ${search.result.totalMatches} מוצרים):\n` +
        search.result.spread
          .map((c) => `- ${c.name}: ${c.count} דגמים, ${c.minPrice}₪–${c.maxPrice}₪`)
          .join("\n")
      : "";

  const complete = search.result.products.length > 0 && search.result.totalMatches <= search.result.products.length;
  const searchContext =
    search.result.products.length > 0
      ? (complete
          ? "כל הדגמים שיש בתחום הזה (זו הרשימה המלאה — אין דגמים נוספים. אסור לשנות מחיר או סטטוס):\n"
          : "דגמים לדוגמה מתוך המלאי (רק דוגמאות, לא כל המגוון. אסור לשנות מחיר או סטטוס):\n") +
        search.result.products
          .map(
            (p) =>
              `- ${p.title} | מותג: ${p.brandName} | קטגוריה: ${p.categoryName} | מחיר: ${p.price}₪ | מלאי: ${p.stockStatus}` +
              (p.summary ? `\n  תיאור: ${p.summary}` : "\n  תיאור: (אין תיאור לדגם הזה)")
          )
          .join("\n") +
        (search.notes.length > 0 ? `\n${search.notes.join("\n")}` : "")
      : pinnedProducts.length > 0
        ? ""
        : "לא נמצאו מוצרים תואמים לחיפוש על ההודעה האחרונה — אין להמציא מוצר; להציע ללקוח לנסח אחרת או להפנות לחיפוש באתר.";

  /* The instruction to recommend and an empty shelf are a dangerous pair.
     With rows in hand the anti-invention rules hold; with none, and a
     persona pushing toward a recommendation, the model wrote two fridges out
     of nothing — model codes, volumes, prices and features, none of them
     real. So when there is nothing to name, that outranks everything else
     and is stated last, where it is read last. */
  const hasAnyProduct = search.result.products.length > 0 || pinnedProducts.length > 0;
  const emptyShelfRule = hasAnyProduct
    ? ""
    : "אזהרה מכריעה: לא קיבלת אף מוצר בהקשר הזה. חל איסור מוחלט לנקוב בשם דגם, בקוד דגם, במחיר או בנפח — גם אם הלקוח כבר ענה על הכל וגם אם זה נראה כמו הרגע להמליץ. במקום זה: שואלים שאלה ממקדת נוספת, או מציעים ללקוח לנסח אחרת ומפנים לחיפוש באתר.";

  const productContext = [intentContext, pinnedContext, spreadContext, searchContext, emptyShelfRule]
    .filter(Boolean)
    .join("\n\n");

  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  const callGemini = (model: string) =>
    fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              { text: `${buildPersona(settings)}${fromMall ? `\n${mallPersona(mallPlace)}` : ""}\n\nהקשר פנימי לתשובה הזו בלבד (לא לצטט כמו שהוא):\n${productContext}` },
            ],
          },
          contents,
          // maxOutputTokens caps thinking and visible text together, not just
          // the visible text, so a low value truncates the reply mid-sentence
          // even though the model "finished" its actual answer just fine.
          //
          // thinkingLevel is where the five-second wait went. Measured on
          // this model, on real questions from this shop:
          //
          //   default    5.2s   ~650 hidden thinking tokens
          //   low        3.3s   ~350
          //   minimal    1.7s   0
          //
          // The answers at "minimal" were as good — side by side on the same
          // questions, the shorter one was if anything more direct and more
          // likely to end by asking something back. That is not surprising:
          // nothing here is a reasoning problem. The persona is fixed, the
          // catalogue rows are handed over already chosen, and the job is to
          // write three warm sentences about them. There was nothing for
          // half a second of deliberation to work out, and the customer paid
          // for it twice — once in waiting and once per token.
          //
          // "thinkingBudget: 0" is rejected by this model; minimal is the
          // floor.
          generationConfig: {
            maxOutputTokens: 2048,
            temperature: 0.6,
            thinkingConfig: { thinkingLevel: "minimal" },
          },
        }),
        signal: AbortSignal.timeout(30000),
      }
    );;

  /* Google's 503 "high demand" is a spike, and a spike is measured in
     seconds: every one in the log so far came in a burst of a minute and
     was gone. A customer who typed a question is not well served by being
     told to come back; the request is made again after a short pause, and
     if the model is still refusing, once more on the fallback model
     (GEMINI_FALLBACK_MODEL, the lighter sibling by default). Only 503 and
     429 are retried — a 400 or 403 is the same answer however often it is
     asked. */
  const RETRYABLE = new Set([429, 503]);
  let geminiRes: Response;
  try {
    geminiRes = await callGemini(GEMINI_MODEL);
    if (RETRYABLE.has(geminiRes.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      geminiRes = await callGemini(GEMINI_MODEL);
    }
    if (RETRYABLE.has(geminiRes.status)) {
      const configured = process.env.GEMINI_FALLBACK_MODEL;
      const fallbacks = (configured !== undefined ? [configured.trim()] : await discoverFallbackModels(apiKey)).filter(
        (m) => m && m !== GEMINI_MODEL,
      );
      for (const fallbackModel of fallbacks) {
        console.warn(`[alfred] gemini ${geminiRes.status} on ${GEMINI_MODEL}; trying ${fallbackModel}`);
        geminiRes = await callGemini(fallbackModel);
        if (!RETRYABLE.has(geminiRes.status)) break;
      }
    }
  } catch (error) {
    /* The customer sees "we are busy"; the log has to say which of the very
       different things went wrong, or the next person debugging this is
       reduced to swapping API keys and hoping. This branch is the network
       itself — a timeout, DNS, a dropped connection — and never Google
       refusing us, which arrives as a perfectly good response below. */
    console.error("[alfred] gemini request failed:", (error as Error).message);
    return NextResponse.json({ error: "השירות עמוס כרגע, נסו שוב בעוד רגע" }, { status: 502 });
  }

  if (!geminiRes.ok || !geminiRes.body) {
    /* Google's own words, which are specific and worth having: an invalid or
       revoked key, a model this key's tier cannot reach, a quota that ran
       out, a project with billing switched off. All four look identical from
       the outside — the same 502 and the same Hebrew sentence — and picking
       between them by trying a different key is how an afternoon goes. */
    const detail = await geminiRes.text().catch(() => "");
    console.error(`[alfred] gemini ${geminiRes.status}:`, detail.slice(0, 500));
    const message = RETRYABLE.has(geminiRes.status)
      ? "אלפרד עמוס כרגע ולא הצליח לענות. נסו שוב בעוד דקה, או התקשרו אלינו."
      : "השירות עמוס כרגע, נסו שוב בעוד רגע";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  /* Every product the model was shown — the reply decides which of them
     actually becomes a card, at the end of the stream. */
  const combinedProducts = [
    ...pinnedProducts.map((p) => ({ ...p, model: null as string | null, pinned: true })),
    ...search.result.products
      .filter((p) => !pinnedProducts.some((pinned) => pinned.slug === p.slug))
      .map((p) => ({ ...p, pinned: false })),
  ]
    .slice(0, 6)
    .map((p) => ({
      pinned: p.pinned,
      model: p.model,
      title: p.title,
      slug: p.slug,
      price: p.price,
      imageUrl: p.imageUrl,
      stockStatus: p.stockStatus,
    }));

  /* Newline-delimited JSON rather than Server-Sent Events.
   *
   * SSE would mean the browser's EventSource, which only does GET — and this
   * request carries a message, a history and pinned ids in its body. One
   * object per line over a plain POST response is the whole protocol, read
   * on the other side with a TextDecoder and a split. */
  const encoder = new TextEncoder();
  const upstream = geminiRes.body;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));

      /* The cards wait for the sentence, and then only the ones it named.
       *
       * They used to go out first, before the model had written a word,
       * because they were already in hand. That was wrong for the same
       * reason a salesperson does not put four fridges on the counter while
       * asking "what kind were you after?" — the question is the answer at
       * that point, and the pile beside it says nobody was listening.
       *
       * So the reply is read as it streams, and when it ends the products
       * whose model code it actually used become the cards. Alfred asking a
       * narrowing question ships no cards at all. Alfred naming the Haier
       * HRF5800FBI ships that one. */
      const reader = upstream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let wroteAnything = false;
      let reply = "";

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          /* Gemini's SSE frames are "data: {…}" lines separated by blank
             lines. A chunk can split one anywhere, so only whole lines are
             parsed and the remainder stays in the buffer for the next read. */
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const json = trimmed.slice(5).trim();
            if (!json || json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
              const text = (parsed.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
              if (text) {
                wroteAnything = true;
                reply += text;
                send({ type: "delta", text });
              }
            } catch {
              // A frame we cannot read is one frame, not the conversation.
            }
          }
        }
      } catch (error) {
        console.error("[alfred] stream broke:", (error as Error).message);
      } finally {
        reader.releaseLock();
      }

      /* A stream that ended having said nothing is a failure the customer
         would otherwise see as an empty bubble. It has already been answered
         with a 200, so it cannot become a 502 now — it becomes a sentence. */
      if (!wroteAnything) send({ type: "delta", text: "מצטער, לא הצלחתי לענות כרגע. נסו לנסח אחרת?" });

      /* Matched on the manufacturer's code, which 1,362 of the 1,366 live
         products have and which the model writes out in full when it names
         one ("האייר HRF5800FBI"). Titles are too long and too alike to match
         on; a code is unambiguous or absent.
         Pinned products are exempt — they are on the customer's screen
         already because the page put them there, not because Alfred chose
         them. */
      /* Matching a model code means ignoring how it was punctuated.
       *
       * The TCL's code is stored as "C635CD WG" and printed in its own title
       * as "C635CDWG". Alfred quoted the title, correctly, and an exact
       * substring test found nothing — so a real recommendation shipped
       * without its card, and the tripwire below reported a hallucination
       * that had not happened. Spaces and hyphens are where these codes
       * disagree with themselves; stripping them from both sides is the
       * whole fix. Five characters minimum, because flattening the reply
       * runs words together and a short code could then match across a
       * boundary that was never there. */
      const flatten = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");
      const flatReply = flatten(reply);
      const codeOf = (p: { model: string | null; title: string }) => {
        const fromModel = flatten(p.model ?? "");
        if (fromModel.length >= 5) return fromModel;
        // Some rows have no usable model; their title still carries the code.
        const token = p.title.match(/\b[A-Za-z][A-Za-z0-9]{2,}[-–]?[A-Za-z0-9]*\d[A-Za-z0-9-]*\b/)?.[0];
        return token ? flatten(token) : "";
      };

      const named = combinedProducts.filter((p) => {
        if (p.pinned) return true;
        const code = codeOf(p);
        return code.length >= 5 && flatReply.includes(code);
      });

      /* A tripwire for the invented-product failure. Every product this shop
         sells has a manufacturer's code, so a code-shaped token in the reply
         matching none of the rows supplied is the signature of one that does
         not exist. Logged rather than suppressed — rewriting a customer's
         answer after the fact is worse than knowing how often this happens. */
      const knownCodes = combinedProducts.map(codeOf).filter((c) => c.length >= 5);
      const codeLike = reply.match(/\b[A-Z][A-Z0-9]{2,}[-–\s]?[A-Z0-9]{2,}\b/g) ?? [];
      const unknown = [...new Set(codeLike.map(flatten))].filter(
        (c) => c.length >= 5 && !knownCodes.some((k) => k.includes(c) || c.includes(k))
      );
      if (unknown.length > 0) {
        console.error(`[alfred] reply named model codes not in context: ${unknown.slice(0, 5).join(", ")}`);
      }
      if (named.length > 0) {
        send({
          type: "products",
          // pinned/model are how the card was chosen, not part of the card.
          products: named.map((p) => ({
            title: p.title,
            slug: p.slug,
            price: p.price,
            imageUrl: p.imageUrl,
            stockStatus: p.stockStatus,
          })),
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Nothing between here and the browser may hold the reply back to
      // buffer it — that would undo the streaming entirely.
      "X-Accel-Buffering": "no",
    },
  });
}
