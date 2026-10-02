import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { searchForChat } from "@/lib/queries/products";
import { parseShoppingQuery, splitSearchWords } from "@/lib/shopping-query";
import { getChatbotSettings } from "@/lib/queries/chatbot-settings";
import { clientKey, rateLimit } from "@/lib/rate-limit";

// Public-facing chat endpoint behind the "Alfred" widget — no bearer auth
// (unlike /api/integrations/*, which are for trusted external agents, not
// site visitors). Stateless: the client resends recent history each turn,
// there's no server-side conversation storage for v1.
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_HISTORY_TURNS = 10;
const MAX_MESSAGE_LENGTH = 1000;

/* Generous for a person and impossible for a loop. A real conversation is
   five or six messages; somebody comparing three fridges might reach twenty.
   Nobody types sixty questions in half an hour, so this is invisible to
   every customer and immediate for a script. */
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 30 * 60 * 1000;

type ChatTurn = { role: "user" | "model"; text: string };

/* Words that mean the visitor is asking about the shop, not naming a thing
   to buy.
 *
 * The product search underneath is a plain substring `contains`, and that is
 * a blunt instrument pointed at a catalogue of two thousand titles: any word
 * long enough to survive the length filter will be found inside *something*.
 * "מה זמן המשלוח שלכם?" returned an electric shaver, because "משלוח" appears
 * in its description, and the customer got a razor attached to an answer
 * about delivery times.
 *
 * The length filter alone cannot fix that — "המשלוח" is six letters. What
 * separates the two cases is not length but subject: these words belong to
 * questions about policy, and a question about policy wants a sentence, not
 * a shelf. Strip them, and if nothing is left, search for nothing.
 *
 * Only words that are never a product. "מקרר" and "בוש" are not here and
 * never will be. */
const CONVERSATIONAL_WORDS = new Set([
  // delivery, warranty, payment, returns — the policy questions
  "משלוח", "המשלוח", "משלוחים", "המשלוחים", "לשלוח", "שליח", "שילוח",
  "אחריות", "האחריות", "אחריותה", "תשלום", "התשלום", "לשלם", "תשלומים",
  "החזרה", "החזרות", "להחזיר", "ביטול", "לבטל", "זיכוי", "החלפה", "להחליף",
  "הזמנה", "ההזמנה", "הזמנות", "להזמין", "מחיר", "המחיר", "מחירים",
  "חשבונית", "קבלה", "מבצע", "מבצעים", "הנחה", "הנחות", "קופון",
  // the shop itself
  "חנות", "החנות", "סניף", "סניפים", "כתובת", "הכתובת", "טלפון", "הטלפון",
  "שעות", "פתוח", "סגור", "שירות", "השירות", "לקוחות", "עסקים",
  // question and filler words long enough to slip past the length filter
  "שלכם", "שלכן", "שלנו", "אצלכם", "איפה", "מתי", "כמה", "למה", "איך",
  "אפשר", "אפשרי", "רוצה", "רציתי", "מחפש", "מחפשת", "צריך", "צריכה",
  "תוכל", "תוכלי", "יכול", "יכולה", "בבקשה", "תודה", "שלום", "היי",
  "שאלה", "שאלות", "לשאול", "לדעת", "להבין", "עוזר", "לעזור", "עזרה",
  "יום", "ימים", "שבוע", "שבועות", "חודש", "חודשים", "היום", "מחר",
  /* "זמן" was the one that got through on the very question this list was
     written for, and it landed on the same shaver: its title reads
     "משוב לחץ בזמן אמת". A word this ordinary will always be inside
     something in a catalogue this size. */
  "זמן", "הזמן", "זמנים", "זמני", "לוקח", "לוקחת", "מגיע", "מגיעה", "מגיעים",
  "עולה", "עולים", "עולות", "כולל", "כוללת", "נמצא", "קיים", "זמין", "זמינות",
  /* "אני רוצה מקרר חדש לבית" was searched as מקרר OR חדש OR לבית, and the
     last two match most of a catalogue full of "חדש בקטלוג" and "מוצרי חשמל
     לבית". They describe the shopper's situation, never the thing they
     want. */
  "חדש", "חדשה", "חדשים", "ישן", "ישנה", "לבית", "בבית", "הבית", "לדירה",
  "בשביל", "עבור", "טוב", "טובה", "טובים", "הכי", "ממליץ", "ממליצים", "המלצה",
  "משהו", "כזה", "כזאת", "איזה", "איזו", "בערך", "אולי", "צריכים", "רוצים",
]);

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
    `— לפני שממליצים על דגם, צריך לדעת לפחות שניים מהשלושה: איזה סוג/תצורה, איזה גודל או נפח, ומה התקציב. כל עוד לא יודעים שניים — שואלים, לא ממליצים.`,
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

export async function POST(request: Request) {
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

  const record = body as { message?: unknown; history?: unknown; pinnedProductIds?: unknown };
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

  // searchProducts's word-matching is a plain substring `contains` — great
  // for a real product query, but a short common word like "מה" (what) is a
  // substring hit inside completely unrelated titles (e.g. "...נפתח מהקיר
  // ..."), so a conversational question ("מה זמן המשלוח שלכם?") ends up
  // "matching" random products that then get attached as cards under an
  // answer that never mentions them. Stripping words under 3 real letters
  // *before* they ever reach searchProducts (not just gating on whether one
  // exists) fixes this — confirmed by hand: the raw message here 5-matched
  // wall-mount arms via "מה", the filtered one correctly matches nothing.
  //
  // The length rule is necessary and not sufficient: "המשלוח" is six letters
  // and still matched a shaver. CONVERSATIONAL_WORDS above catches the rest.
  /* The search reads the conversation, not the last line of it.
   *
   * This is the bug that made Alfred invent two fridges. Asked "אני מחפש
   * מקרר", then "4 דלתות", then "עד 5000 שקל וחשוב לי שיהיה גדול", the
   * search ran on that last sentence alone — which contains no product word
   * at all, because the product was named two turns earlier. The context
   * arrived empty on the very turn a recommendation was due, and the model
   * filled the gap itself: a Midea HQ-627WEN and a Hisense RQ68N4BIE, with
   * volumes, prices and features. Neither exists.
   *
   * A shopper narrowing down does not repeat what they are shopping for, so
   * the words that matter are spread across turns. Recent turns first, and
   * only the customer's own words — echoing the model's replies back into
   * the search would let one wrong guess feed itself. */
  const recentUserText = [
    message,
    ...history
      .filter((h) => h.role === "user")
      .slice(-4)
      .reverse()
      .map((h) => h.text),
  ].join(" ");

  const { maxPrice } = parseShoppingQuery(message);
  const seenWords = new Set<string>();
  const substantiveWords = splitSearchWords(parseShoppingQuery(recentUserText).text)
    .map((w) => w.replace(/[?!.,]/g, ""))
    .filter((w) => {
      if (w.length < 3 || CONVERSATIONAL_WORDS.has(w) || seenWords.has(w)) return false;
      seenWords.add(w);
      return true;
    });

  /* A budget with nothing else in it would match the whole catalogue under
     that number, so the ceiling only applies alongside real words. */
  const priceCeiling = substantiveWords.length > 0 && maxPrice !== null ? maxPrice : undefined;

  const [search, settings, pinnedRows] = await Promise.all([
    substantiveWords.length > 0
      /* Six, and the same six become the cards below the reply.
       *
       * With ten in context and four on screen, Alfred recommended a Hitachi
       * at ₪8,200 that the customer had no way to click — it was in the list
       * the model read and not in the list it could see. Naming a product
       * and not showing it wastes the recommendation, and the fix is for the
       * two lists to be one list. Six is enough range to choose from; the
       * breadth of the shop is carried by the category breakdown, not by
       * how many examples are pasted in. */
      ? searchForChat(substantiveWords, { limit: 6, maxPrice: priceCeiling })
      : Promise.resolve({ products: [], spread: [], totalMatches: 0 }),
    getChatbotSettings(),
    pinnedIds.length > 0
      ? db.product.findMany({
          where: { id: { in: pinnedIds }, ...PUBLIC_PRODUCT_WHERE },
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

  const pinnedProducts = pinnedIds
    .map((id) => pinnedRows.find((r) => r.id === id))
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
      ? "מוצרים שמוצגים ללקוח כרגע על המסך בווידג'ט 'אלפרד ממליץ' (הכי רלוונטיים לשיחה הזו):\n" +
        pinnedProducts
          .map((p) => `- ${p.title} | מותג: ${p.brandName} | מחיר: ${p.price}₪ | סטטוס מלאי: ${p.stockStatus}`)
          .join("\n")
      : "";
  /* What the shop really holds for this question — the part that lets Alfred
     ask "which kind?" instead of describing whichever ten rows came back.
     Without it a model handed ten products says the shop has ten products'
     worth of range, which is how a customer asking for a fridge was told
     this shop sells mini-bars. */
  const spreadContext =
    search.spread.length > 0
      ? `מה שיש בחנות בפועל בתחום שנשאל (זה המקור היחיד לתיאור המגוון — סה"כ ${search.totalMatches} מוצרים):\n` +
        search.spread
          .map((c) => `- ${c.name}: ${c.count} דגמים, ${c.minPrice}₪–${c.maxPrice}₪`)
          .join("\n")
      : "";

  const searchContext =
    search.products.length > 0
      ? "דגמים לדוגמה מתוך המלאי (רק דוגמאות, לא כל המגוון. אסור לשנות מחיר או סטטוס):\n" +
        search.products
          .map(
            (p) =>
              `- ${p.title} | מותג: ${p.brandName} | קטגוריה: ${p.categoryName} | מחיר: ${p.price}₪ | מלאי: ${p.stockStatus}` +
              (p.summary ? `\n  תיאור: ${p.summary}` : "\n  תיאור: (אין תיאור לדגם הזה)")
          )
          .join("\n")
      : pinnedProducts.length > 0
        ? ""
        : "לא נמצאו מוצרים תואמים לחיפוש על ההודעה האחרונה — אין להמציא מוצר; להציע ללקוח לנסח אחרת או להפנות לחיפוש באתר.";

  /* The instruction to recommend and an empty shelf are a dangerous pair.
     With rows in hand the anti-invention rules hold; with none, and a
     persona pushing toward a recommendation, the model wrote two fridges out
     of nothing — model codes, volumes, prices and features, none of them
     real. So when there is nothing to name, that outranks everything else
     and is stated last, where it is read last. */
  const hasAnyProduct = search.products.length > 0 || pinnedProducts.length > 0;
  const emptyShelfRule = hasAnyProduct
    ? ""
    : "אזהרה מכריעה: לא קיבלת אף מוצר בהקשר הזה. חל איסור מוחלט לנקוב בשם דגם, בקוד דגם, במחיר או בנפח — גם אם הלקוח כבר ענה על הכל וגם אם זה נראה כמו הרגע להמליץ. במקום זה: שואלים שאלה ממקדת נוספת, או מציעים ללקוח לנסח אחרת ומפנים לחיפוש באתר.";

  const productContext = [pinnedContext, spreadContext, searchContext, emptyShelfRule]
    .filter(Boolean)
    .join("\n\n");

  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  let geminiRes: Response;
  try {
    /* streamGenerateContent, not generateContent.
     *
     * The whole answer took just over five seconds to arrive, and all five
     * were a blank bubble with three dots in it. The model does not take
     * five seconds to start — it takes five seconds to finish, and waiting
     * for the last word before showing the first is a choice this code was
     * making on the customer's behalf. Streaming the same answer puts the
     * first words on screen in well under a second. Nothing about the reply
     * changes; only how long the shop looks broken. */
    geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [
              { text: `${buildPersona(settings)}\n\nהקשר פנימי לתשובה הזו בלבד (לא לצטט כמו שהוא):\n${productContext}` },
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
    );
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
    return NextResponse.json({ error: "השירות עמוס כרגע, נסו שוב בעוד רגע" }, { status: 502 });
  }

  /* Every product the model was shown — the reply decides which of them
     actually becomes a card, at the end of the stream. */
  const combinedProducts = [
    ...pinnedProducts.map((p) => ({ ...p, model: null as string | null, pinned: true })),
    ...search.products
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
