import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { PUBLIC_PRODUCT_WHERE } from "@/lib/queries/products";
import { searchProducts } from "@/lib/queries/products";
import { parseShoppingQuery, splitSearchWords } from "@/lib/shopping-query";
import { getChatbotSettings } from "@/lib/queries/chatbot-settings";

// Public-facing chat endpoint behind the "Alfred" widget — no bearer auth
// (unlike /api/integrations/*, which are for trusted external agents, not
// site visitors). Stateless: the client resends recent history each turn,
// there's no server-side conversation storage for v1.
export const dynamic = "force-dynamic";

const GEMINI_MODEL = "gemini-3.6-flash";
const MAX_HISTORY_TURNS = 10;
const MAX_MESSAGE_LENGTH = 1000;

type ChatTurn = { role: "user" | "model"; text: string };

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
    `את/ה "אלפרד" — עוזר שירות הלקוחות של A&I Electronics, חנות אלקטרוניקה ומוצרי חשמל ישראלית מקוונת.`,
    `מדברים בעברית בלבד, בטון חם, אישי וקצר — כמו נציג שירות אנושי טוב, לא כמו רובוט. 2-4 משפטים לתשובה, לא יותר, אלא אם ממש נדרש יותר.`,
    `עוזרים ללקוחות למצוא מוצרים, עונים על שאלות משלוח/אחריות/תשלום, ומכוונים באתר.`,
    `כלל ברזל: אסור להמציא מחיר, זמינות במלאי, או פרטי מוצר שלא ניתנו במפורש בהקשר הפנימי למטה. אם אין מידע על מוצר מסוים — אומרים שלא בטוחים ומציעים לחפש באתר או לפנות לצוות, לא מנחשים.`,
    `משלוח: ${settings.shippingInfo}`,
    `אחריות: ${settings.warrantyInfo}`,
  ];
  if (settings.serviceHours) lines.push(`שעות שירות: ${settings.serviceHours}`);
  if (settings.additionalNotes) lines.push(`מידע נוסף חשוב: ${settings.additionalNotes}`);
  lines.push(`אם שואלים על הזמנה אישית ספציפית (סטטוס, זיכוי וכו') — מסבירים שאין גישה לזה כרגע ומפנים ליצירת קשר עם הצוות.`);
  // A single message often carries two questions ("איזה תנור מתאים? ומה זמן
  // המשלוח?"). The model reliably answered the first and dropped the second,
  // which reads as not listening.
  lines.push(`אם ההודעה כוללת יותר משאלה אחת — עונים על כל אחת מהן, ולא רק על הראשונה.`);
  // The retrieved products are a search result, not a shortlist: the search
  // is deliberately forgiving (see searchProducts) so a product can come back
  // on one loose word match. Recommending one that misses a stated budget or
  // product type is worse than saying nothing came up.
  lines.push(`אם הלקוח ציין תקציב או סוג מוצר — ממליצים רק על מוצרים מההקשר שעומדים בו. מוצר שלא מתאים לבקשה לא מוזכר בכלל, גם אם הוא מופיע בהקשר.`);
  return lines.join("\n");
}

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "הצ'אט לא זמין כרגע" }, { status: 503 });
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
  // maxPrice is kept, not discarded. parseShoppingQuery both reads the budget
  // out of "תנור בנוי עד 3,000 ₪" and strips that phrase from the text, so the
  // string handed to searchProducts no longer contains it — the ceiling has to
  // travel separately or it is lost, which is exactly what was happening when
  // a 3,000₪ question came back with a 3,790₪ oven attached.
  const { text: searchText, maxPrice } = parseShoppingQuery(message);
  const substantiveWords = splitSearchWords(searchText)
    .map((w) => w.replace(/[?!.,]/g, ""))
    .filter((w) => w.length >= 3);
  const [products, settings, pinnedRows] = await Promise.all([
    substantiveWords.length > 0 ? searchProducts(substantiveWords.join(" "), 5, maxPrice) : Promise.resolve([]),
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
  const searchContext =
    products.length > 0
      ? "מוצרים רלוונטיים מהמלאי האמיתי שלנו כרגע (אפשר להתייחס אליהם, אסור לשנות מחיר/סטטוס ביחס למה שכתוב כאן):\n" +
        products
          .map((p) => `- ${p.title} | מותג: ${p.brandName} | מחיר: ${p.price}₪ | סטטוס מלאי: ${p.stockStatus}`)
          .join("\n")
      : pinnedProducts.length > 0
        ? ""
        : "לא נמצאו מוצרים תואמים לחיפוש על ההודעה האחרונה — אין להמציא מוצר; להציע ללקוח לנסח אחרת או להפנות לחיפוש באתר.";
  const productContext = [pinnedContext, searchContext].filter(Boolean).join("\n\n");

  const contents = [
    ...history.slice(-MAX_HISTORY_TURNS).map((h) => ({ role: h.role, parts: [{ text: h.text }] })),
    { role: "user", parts: [{ text: message }] },
  ];

  let geminiRes: Response;
  try {
    geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": apiKey },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: `${buildPersona(settings)}\n\nהקשר פנימי לתשובה הזו בלבד (לא לצטט כמו שהוא):\n${productContext}` }],
        },
        contents,
        // gemini-3.6-flash spends a meaningful chunk of this budget on
        // hidden "thinking" tokens before it ever writes the visible reply
        // (measured ~500 thinking tokens for a two-sentence answer) —
        // maxOutputTokens caps that total, not just the visible text, so a
        // low value here truncates the reply mid-sentence even though the
        // model "finished" its actual answer just fine.
        generationConfig: { maxOutputTokens: 2048, temperature: 0.6 },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    return NextResponse.json({ error: "השירות עמוס כרגע, נסו שוב בעוד רגע" }, { status: 502 });
  }

  if (!geminiRes.ok) {
    return NextResponse.json({ error: "השירות עמוס כרגע, נסו שוב בעוד רגע" }, { status: 502 });
  }

  const data = await geminiRes.json();
  const parts: { text?: string }[] = data?.candidates?.[0]?.content?.parts ?? [];
  const reply = parts.map((p) => p.text ?? "").join("").trim() || "מצטער, לא הצלחתי לענות כרגע. נסו לנסח אחרת?";

  const combinedProducts = [
    ...pinnedProducts,
    ...products.filter((p) => !pinnedProducts.some((pinned) => pinned.slug === p.slug)),
  ];

  return NextResponse.json({
    reply,
    products: combinedProducts.map((p) => ({
      title: p.title,
      slug: p.slug,
      price: p.price,
      imageUrl: p.imageUrl,
      stockStatus: p.stockStatus,
    })),
  });
}
