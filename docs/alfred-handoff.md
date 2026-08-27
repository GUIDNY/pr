# משימה: עריכת מוצרים קיימים (בעדיפות ראשונה!) והוספת מוצרים חדשים ל-A&I Electronics דרך ה-API

אתה (קלוד) מקבל גישה ל-API פנימי של חנות אלקטרוניקה ישראלית חיה (Next.js + Prisma + Postgres), כדי **לעבור על כל המוצרים הקיימים באתר ולהשלים לכל אחד את מה שחסר לו — זו המשימה החשובה ביותר, לא רק רשימה מצומצמת שכבר סומנה** — ורק אחר כך, אם רוצים, גם להוסיף מוצרים חדשים. המסמך הזה הוא כל מה שאתה צריך — endpoints, סכימות, כללי ברזל, ודוגמאות curl מוכנות. קרא את כולו לפני שאתה מתחיל.

---

## 0. חוק-על אחד שאסור לשבור אף פעם

**כל תמונה חייבת להיות תמונה אמיתית של המוצר, מהיצרן/ספק המקורי בלבד.**

- אסור לבדות URL של תמונה, אסור תמונת סטוק גנרית, אסור תמונה של מוצר דומה-אבל-לא-זהה, אסור תמונה שנוצרה ע"י AI.
- **לפני** שאתה שם URL של תמונה ב-payload — תוריד/תפתח אותה בעצמך ותסתכל עליה (למשל עם WebFetch/הורדה ובדיקה חזותית), ותוודא שזה באמת המוצר הנכון, מהזווית/מהדגם הנכון. השרת בודק שה-URL "חי" (200 ותוכן שנראה כמו תמונה), אבל **לא בודק שזאת התמונה הנכונה** — זה תפקידך, לא של השרת.
- לכל תמונה שאתה שולח, צרף גם מאיפה היא הגיעה (ראה שדות provenance למטה — `sourcePageUrl` / `sourceImageUrl` / `sourceDomain`). זה בדיוק מה שהתבקש: "מאיזה URL התמונה" — זה נשמר על כל שורת תמונה במסד הנתונים, גלוי לאדמין.
- שאפו ל**3 תמונות אמיתיות** לכל מוצר (המקסימום הנתמך — ראו §7). אם באמת אין 3 תמונות אמיתיות זמינות — עדיף 1-2 תמונות אמיתיות מאשר לממציא תמונה שלישית.
- תיאור (`description`) צריך להיות **אמיתי, מתאים לספציפית המוצר, וארוך/מפורט** — לא משפט גנרי אחד. תבססו על עמוד המוצר האמיתי של היצרן/הספק (מפרט טכני אמיתי, לא ניחוש), וצרפו `descriptionSourceUrl`.

---

## 1. גישה בסיסית

```
Base URL: https://pr-ayam.vercel.app
Auth:     Authorization: Bearer <PRODUCT_ENRICH_SECRET>
```

⚠️ **הערך של `PRODUCT_ENRICH_SECRET` לא נמצא בקוד/בריפו** — הוא מוגדר כמשתנה סביבה מוצפן ב-Vercel (Production, פרויקט `guidnys-projects/pr-ayam`). **בעל האתר צריך למלא אותו כאן ידנית** לפני שמעבירים את המסמך:

```
PRODUCT_ENRICH_SECRET=<< להשלים ידנית — Vercel Dashboard → Project → Settings → Environment Variables, או `vercel env pull` בטרמינל >>
```

כל דוגמאות ה-curl למטה מניחות שיש לך את הערך במשתנה סביבה מקומי:
```bash
export PRODUCT_ENRICH_SECRET="הערך-האמיתי-כאן"
```

ארבעת ה-endpoints זמינים עם אותו טוקן בדיוק:
1. **`GET /api/integrations/products`** ← **תתחילו כאן — עברו על כל הקטלוג, לא רק על הרשימה המצומצמת.** דפדוף על כל המוצרים הקיימים באתר, עם דגל לכל מוצר שחסר לו תמונה/מפרט/תיאור.
2. **`GET /api/integrations/products-needing-attention`** — רשימה מצומצמת ("המוצרים שבטיפול") של המקרים החמורים ביותר שכבר סומנו במערכת — שימושי בנוסף, לא במקום §2.
3. **`POST /api/integrations/product-enrich`** — עריכה/השלמה של מוצר קיים (זו המשימה העיקרית).
4. **`POST /api/integrations/products`** — יצירת מוצר חדש (רק אם באמת אין SKU כזה עדיין).

---

## 2. עברו על **כל** המוצרים הקיימים — `GET /api/integrations/products`

**המשימה היא לעבור על כל הקטלוג, לא רק על מוצרים שכבר סומנו.** ה-endpoint הזה מדפדף על כל המוצרים באתר (לא רק אלה שכבר "בטיפול" רשמית — ראו §3 להסבר למה זה שונה), ומחזיר לכל מוצר אם חסרה לו תמונה/מפרט/תיאור.

```bash
curl -s "https://pr-ayam.vercel.app/api/integrations/products?limit=100&onlyIncomplete=true" \
  -H "Authorization: Bearer $PRODUCT_ENRICH_SECRET" | python3 -m json.tool
```

תשובה לדוגמה:
```json
{
  "count": 100,
  "nextCursor": "ZZZ999",
  "products": [
    {
      "sku": "ABC123",
      "title": "מקרר 4 דלתות...",
      "slug": "product-slug",
      "model": null,
      "colorName": null,
      "brandName": "Samsung",
      "categoryName": "מקררים",
      "categorySlug": "refrigerators",
      "price": 4200,
      "stockQty": 5,
      "isPublished": true,
      "imageCount": 1,
      "hasSpec": false,
      "hasDescription": false
    }
  ]
}
```

- `?limit=N` — עד 200 מוצרים בעמוד (ברירת מחדל 50).
- `?after=<sku>` — עמוד הבא: קחו את ה-`nextCursor` מהתשובה הקודמת ושימו אותו כאן. חוזרים על זה עד ש-`nextCursor` חוזר `null` — זה סימן שעברתם על כל הקטלוג.
- `?onlyIncomplete=true` — **מומלץ תמיד** — מסנן ומחזיר רק מוצרים שחסר להם **לגמרי** אחד מהשלושה: אפס תמונות, אפס מפרט (גם לא מפרט חופשי), או אין תיאור בכלל. בלי הדגל הזה תקבלו את כל הקטלוג כולל מוצרים תקינים לגמרי.
- `?hasModel=false` — **חדש** — מוצרים בלי מספר דגם יצרן (`model`) בכלל. זו החסימה האמיתית ברוב המקרים: בלי מספר דגם אי אפשר לאתר את המוצר אצל היצרן, לא משנה כמה תמונות/מפרט חסרים. `?hasModel=true` הופכי, בעיקר לבדיקות. `model`/`colorName` חשופים עכשיו בכל מוצר בתשובה (§4 מסביר איך למלא אותם).
- שימו לב: `imageCount: 1` או `2` (פחות מ-3 אבל לא אפס) **לא** נחשב "incomplete" ע"י הפילטר — אם תרצו להוסיף תמונה שלישית למוצר עם תמונה אחת, זה שיפור נחמד אבל לא חובה; תעדיפו קודם כל מוצר עם `imageCount: 0`.
- כל מוצר ברשימה הזו — עברו לסעיף 4 (`product-enrich`) כדי להשלים לו את החסר, בדיוק כמו במוצרים מ-§3.

---

## 3. אופציה משלימה — הרשימה המצומצמת של המקרים החמורים — `GET /api/integrations/products-needing-attention`

זה בדיוק מה שהאדמין רואה בעצמו בלוח הבקרה תחת "טיפול" ו"טיפול דחוף" — לא ניחוש, אלא אותה רשימה בדיוק (טבלת ההתראות הפנימית של האתר). **זו תת-קבוצה מצומצמת** של מה שתקבלו מ-§2 עם `onlyIncomplete=true` — היא מסמנת מוצר רק כשהוא **גם** מפורסם, **גם** במלאי, **וגם** חסר לו לגמרי תמונה **וגם** מפרט **וגם** תיאור-גולמי בו-זמנית (המקרה הכי גרוע, שבגללו המוצר אפילו הוסר אוטומטית מהתצוגה באתר). אם המשימה היא "לעבור על הכל" — תעבדו דרך §2; אם רוצים רק להתמקד קודם במקרים הכי דחופים — זה כלי טוב לזה.

```bash
curl -s "https://pr-ayam.vercel.app/api/integrations/products-needing-attention" \
  -H "Authorization: Bearer $PRODUCT_ENRICH_SECRET" | python3 -m json.tool
```

תשובה לדוגמה:
```json
{
  "count": 3,
  "products": [
    {
      "sku": "ABC123",
      "title": "מקרר 4 דלתות...",
      "slug": "product-slug",
      "alertType": "URGENT_MISSING_MEDIA",
      "severity": "CRITICAL",
      "message": "מקרר 4 דלתות...: אין תמונה ואין מפרט טכני — הוסר מהתצוגה באתר עד שיתווסף לפחות אחד מהשניים",
      "missingImage": true,
      "missingSpec": true,
      "isPublished": false,
      "stockQty": 5,
      "brandName": "לא ידוע",
      "categoryName": "מקררים",
      "categorySlug": "refrigerators",
      "flaggedAt": "2026-08-20T10:00:00.000Z"
    }
  ]
}
```

- ברירת המחדל מחזירה שלושה סוגי דגלים ("מוצרים שבטיפול" במובן המדויק): `URGENT_MISSING_MEDIA` (אוטומטי — אין תמונה **וגם** אין מפרט **וגם** אין תיאור גולמי, המוצר אפילו הוסר מהתצוגה באתר עד שיתוקן), `MANUAL_ATTENTION` ו-`MANUAL_URGENT` (דגלים ידניים שאדמין סימן על מוצר מהעמוד שלו).
- ⚠️ **מלכודת שמות**: בלוח הבקרה עצמו, `/admin/inventory/urgent-critical` (שם ה-URL) הוא דווקא זה שמוצג "טיפול דחוף" (חמור יותר), ו-`/admin/inventory/urgent` (בלי "critical") מוצג "טיפול" (כללי יותר). **סדר החומרה לא תואם לסדר האותיות ב-URL** — אל תניחו, תסתכלו על `alertType`/`severity` בתשובה עצמה.
- `missingImage`/`missingSpec` כבר מחושבים לכם — אתם יודעים בדיוק מה חסר בלי לנחש.
- `?limit=N` (עד 200, ברירת מחדל 50). `?type=MANUAL_URGENT` כדי לסנן לסוג ספציפי. `?type=ANY` כדי לקבל את כל ההתראות הפתוחות מכל סוג (גם דברים שאינם קשורים לתוכן מוצר, כמו מלאי נמוך — פחות רלוונטי למשימה שלכם, השתמשו רק אם מבקשים מכם מפורשות).

**לכל מוצר ברשימה הזו — עברו לסעיף 4 כדי להשלים לו את החסר.**

---

## 4. עריכת/השלמת מוצר קיים — `POST /api/integrations/product-enrich` (המשימה העיקרית!)

משתמשים בזה כש-SKU **כבר קיים** באתר וחסר לו מידע (תמונות, תיאור, מפרט) — בדיוק המוצרים שקיבלתם מ-§2 (או §3). **לא יוצר מוצר חדש** — אם ה-SKU לא נמצא, מקבלים `{ "sku": "...", "matched": false }` (לא שגיאה).

⚠️ חשוב: ה-endpoint הזה **לא דורס** שדות ששייכים לסנכרון מלאי (Excel/ERP): `name`, `price`, `stock`, `category` — אלה תמיד יידחו עם הסבר, גם אם תשלחו אותם, **בלי יוצא מן הכלל** — אין דרך לעקוף את זה, גם לא עם `overwrite` למטה.

עבור שדות אחרים שכבר מלאים (brand/supplier/warranty/description/technicalSpec) — ברירת המחדל היא לא לגעת, אבל **עכשיו יש דרך לעקוף במפורש, שדה-שדה**:

```ts
overwrite?: string[];  // למשל: ["brand"], או ["technicalSpec.screen_size"], או ["description"]
```

מערך של שמות שדות ספציפיים — לא דגל גורף — כדי שדריסה תמיד תהיה החלטה מפורשת על שדה ספציפי, ולא תמחק בטעות תוכן טוב בשדה אחר. אפשר גם ברמת הבקשה כולה (`overwrite` בגוף הראשי, חל על כל הפריטים ב-batch) וגם ברמת פריט בודד (`overwrite` בתוך הפריט עצמו, דורס את ברירת המחדל של הבקשה).

ערכים נתמכים: `"brand"`, `"supplier"`, `"warranty"`, `"model"`, `"colorName"`, `"description"` (שקול ל-`overwriteDescription:true`), `"technicalSpec.<key>"` לשדה מפרט ספציפי אחד (למשל `"technicalSpec.capacity_kg"`), ו-`"images"` (מחליף את כל סט התמונות — שקול ל-`replaceImages:true` — כשיש גם `images` ולא הוגדר `appendImages`/`replaceImages` במפורש).

⚠️ **תוקן סופית**: `overwrite` שהוא לא מערך (למשל `overwrite: true`) כבר לא קורס — עכשיו נדחה עם שגיאה ברורה: ברמת הבקשה כולה (`overwrite` בגוף הראשי) מחזיר **HTTP 400**; ברמת פריט בודד ב-batch מחזיר `{ matched: false, error: "..." }` לאותו פריט בלבד, בלי להפיל את שאר ה-batch.

כשדורסים שדה — התשובה כוללת `applied[]` ו-`overwritten[]` (עם הערך הקודם לכל שדה שנדרס) — **אותם שמות שדות בדיוק ב-`dryRun` וגם בכתיבה אמיתית** (בעבר ב-dryRun זה נקרא `wouldApply`/`wouldOverwrite` — אוחד לשם אחד):
```json
{ "sku": "842800", "brand": "גורניה", "overwrite": ["brand"], "dryRun": true }
```
מחזיר:
```json
{ "matched": true, "applied": ["brand (overwritten)"],
  "overwritten": [{ "field": "brand", "previousValue": "בלנדר - לשקיים ופירות" }], "skipped": [] }
```

**חדש — `colorName`**: שדה אמיתי ומובנה לגוון/צבע (למשל "רוז גולד") — לא ניחוש, ולא צריך לדחוס לתוך `description`. אותה סמנטיקה כמו `model`: נכתב אם ריק, נדרס עם `overwrite: ["colorName"]`. חשוף גם ב-`GET /api/integrations/products` (§2).

### סכימת הבקשה

```ts
{
  sku: string;                    // חובה — מפתח ההתאמה
  model?: string;                  // מק"ט/דגם היצרן — נכתב רק אם ריק, אלא אם "model" ב-overwrite (חדש)
  description?: string;            // נכתב רק אם התיאור כרגע ריק, אלא אם overwriteDescription:true
  descriptionSourceUrl?: string;
  technicalSpec?: { [key: string]: string | number | boolean };  // ממלא רק שדות שעוד לא מוגדרים — שמות ה-key מתוך §5
  specSourceUrl?: string;
  images?: (string | {
    url: string;
    sourcePageUrl?: string;   // עמוד המוצר שבו מצאתם את התמונה
    sourceImageUrl?: string;  // ה-URL המקורי/רזולוציה מלאה אם שונה מ-url
    sourceDomain?: string;
    capturedAt?: string;      // ISO date
  })[];
  removeImages?: string[];         // מוחק תמונות ספציפיות לפי URL מדויק (חדש — ראו למטה)
  appendImages?: boolean;          // מוסיף תמונות חדשות (עד המקסימום של 3)
  replaceImages?: boolean;         // מוחק את כל התמונות הקיימות ומחליף (רק אם לפחות תמונה אחת חדשה תקינה)
  overwriteDescription?: boolean;
  brand?: string;                  // ראו אזהרה למעלה — נכתב אם ריק/"לא ידוע", או אם "brand" ב-overwrite
  warranty?: string | number;      // ראו אזהרה למעלה — נכתב אם ברירת מחדל, או אם "warranty" ב-overwrite
  supplier?: string;
  overwrite?: string[];            // דריסה מפורשת שדה-שדה — ראו למעלה
  sourceUrl?: string;
  sourceBackfillOnly?: boolean;    // כותב רק שדות "מקור" (מאיפה), בלי לגעת בתוכן עצמו
}
```

אפשר גם batch: `{ "items": [ {...}, {...} ], "dryRun": true }` (עד 200 פריטים). **תמיד תריצו קודם עם `"dryRun": true`.**

אם לא מציינים `appendImages`/`replaceImages` ולמוצר כבר יש תמונה אחת או יותר — הבקשה תדלג על תמונות. אם אין למוצר תמונות בכלל (המצב הנפוץ ביותר במוצרים "בטיפול") — התמונות נכתבות כרגיל, בלי צורך בדגל.

**חדש — `removeImages: string[]`**: מוחק תמונות ספציפיות לפי URL מדויק, בלי לגעת בשאר. זה הכלי לתקן "תמונה אחת שגויה, השאר בסדר" — לא `replaceImages` (שמוחק את כל הסט) ולא `appendImages` (מוסיף בלבד, לא מוחק). אפשר לשלב באותה קריאה עם `images`/`appendImages` כדי להסיר תמונה שגויה ולהוסיף את הנכונה יחד:
```json
{ "sku": "784041", "removeImages": ["https://wrong-source.co.il/old.jpg"], "images": ["https://real-supplier.co.il/correct.jpg"], "appendImages": true }
```

### דוגמת curl — הוספת 3 תמונות אמיתיות + תיאור למוצר שהתקבל מ-§2/§3

```bash
curl -X POST https://pr-ayam.vercel.app/api/integrations/product-enrich \
  -H "Authorization: Bearer $PRODUCT_ENRICH_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "dryRun": true,
    "sku": "ABC123",
    "images": [
      { "url": "https://real-supplier.co.il/img1.jpg", "sourcePageUrl": "https://real-supplier.co.il/product/123", "sourceDomain": "real-supplier.co.il" },
      { "url": "https://real-supplier.co.il/img2.jpg", "sourcePageUrl": "https://real-supplier.co.il/product/123", "sourceDomain": "real-supplier.co.il" },
      { "url": "https://real-supplier.co.il/img3.jpg", "sourcePageUrl": "https://real-supplier.co.il/product/123", "sourceDomain": "real-supplier.co.il" }
    ],
    "description": "תיאור אמיתי, מפורט, מבוסס על מקור אמיתי...",
    "descriptionSourceUrl": "https://real-supplier.co.il/product/123",
    "technicalSpec": { "screen_size": "55" },
    "specSourceUrl": "https://real-supplier.co.il/product/123"
  }' | python3 -m json.tool
```

תשובה לדוגמה:
```json
{
  "sku": "ABC123",
  "matched": true,
  "productId": "clx...",
  "slug": "existing-product-slug",
  "applied": ["description", "technicalSpec.screen_size", "images.append"],
  "skipped": [{ "field": "brand", "reason": "already set (Sony)" }],
  "currentImageCount": 0, "imagesToAppend": 3, "resultingImageCount": 3
}
```

לאחר שממלאים תמונה + מפרט למוצר שהיה `URGENT_MISSING_MEDIA` (isPublished:false) — האתר עצמו מזהה את זה אוטומטית בסנכרון הבא ומפרסם אותו מחדש. לא צריך שלב נוסף.

---

## 5. גילוי קטגוריות ושדות מפרט אמיתיים — `GET /api/integrations/product-enrich`

צריך רק אם אתם ממלאים `technicalSpec` ורוצים לדעת אילו שמות `key` המערכת מכירה עבור הקטגוריה הספציפית, או אם אתם יוצרים מוצר חדש (סעיף 6) וצריכים `category` slug תקין.

```bash
curl -s "https://pr-ayam.vercel.app/api/integrations/product-enrich" \
  -H "Authorization: Bearer $PRODUCT_ENRICH_SECRET" | python3 -m json.tool
```

תשובה (מקוצר):
```json
{
  "categories": [
    { "slug": "tv", "name": "טלוויזיות", "attributes": [
        { "key": "screen_size", "label": "גודל מסך", "unit": "\"", "inputType": "text" }
    ]}
  ],
  "allCategories": [ { "slug": "tv", "name": "טלוויזיות" }, ... ]
}
```
אפשר גם `?category=<slug>` לצמצם לקטגוריה ספציפית. שדה לא-ממופה עדיין נשמר (בתוך `extraSpecsRaw`), רק לא כשדה מפרט מובנה.

---

## 6. יצירת מוצר חדש (משני בעדיפות) — `POST /api/integrations/products`

משתמשים בזה **רק** אם ה-SKU עוד לא קיים באתר בכלל (לא הגיע מ-§2/§3, ולא נמצא דרך product-enrich). כל מוצר שנוצר דרך ה-API הזה **נוצר תמיד כ-`isPublished: false`** — אדם צריך לאשר פרסום ב-`/admin/inventory`. זה בכוונה ולא באג.

### סכימת הבקשה

```ts
{
  sku: string;              // חובה — מזהה ייחודי, לא קיים כבר
  title: string;            // חובה
  brand: string;            // חובה — שם מותג (טקסט חופשי). אם לא קיים אצלנו במדויק — ייווצר מותג חדש אוטומטית
  category: string;         // חובה — slug קיים מתוך allCategories (§5)
  price: number;            // חובה — מספר חיובי
  model?: string;
  description?: string;
  descriptionSourceUrl?: string;
  technicalSpec?: { [key: string]: string | number | boolean };
  specSourceUrl?: string;
  images?: (string | { url: string; sourcePageUrl?: string; sourceImageUrl?: string; sourceDomain?: string; capturedAt?: string })[];  // מקסימום 3, https בלבד
  warranty?: string | number;
  supplier?: string;
  stockQty?: number;
  sourceUrl?: string;
}
```

אפשר מוצר בודד או `{ items: [...], dryRun: true }` (עד 200). **תמיד `dryRun:true` קודם.**

### שגיאות נפוצות ב-`results[]`

- `"missing sku"` / `"missing title"` / `"missing brand"` / `"missing category"`
- `"price must be a positive number"`
- `"SKU already exists (product <id>) — use POST /api/integrations/product-enrich to update it instead"` ← עברו לסעיף 4
- `'unknown category slug "..." — call GET /api/integrations/product-enrich to see allCategories'`

---

## 7. מה **אי אפשר** לעשות דרך ה-API הזה (אל תבטיחו את זה למשתמש)

- **סרטונים למוצר** — אין שום שדה וידאו בסכימת המוצר בכלל. זו לא מגבלת API — זה פשוט לא קיים במערכת היום. דורש שינוי סכימה + קוד, לא רק קריאת API.
- **תיקון מותג שכבר קיים ושגוי** על מוצר קיים — `brand` ב-enrich נכתב רק כשהמותג הנוכחי הוא "לא ידוע". מותג שגוי-אבל-לא-ריק לא ישתנה דרך ה-API הזה.
- **פרסום מוצר** — מוצר חדש תמיד נוצר לא-מפורסם. הפרסום עצמו צעד אנושי נפרד באדמין.
- **יותר מ-3 תמונות** למוצר — 3 זה התקרה הקשיחה.

---

## 8. זרימת עבודה מומלצת — עוברים על **כל** הקטלוג (בסדר עדיפות)

1. `GET /api/integrations/products?limit=100&onlyIncomplete=true` (§2) → קבלו עמוד ראשון של מוצרים קיימים שחסר להם משהו, עם `imageCount`/`hasSpec`/`hasDescription` לכל אחד.
2. לכל מוצר בעמוד: אתרו אותו אצל היצרן/ספק אמיתי באינטרנט (לפי `brandName`+`title`) → הורידו/צפו בכל תמונה מועמדת בעצמכם לפני שימוש → אספו מפרט אמיתי + תיאור אמיתי וארוך.
3. `POST /api/integrations/product-enrich` (§4) עם `dryRun:true` → בדקו `applied`/`skipped` → אם תקין, שוב עם `dryRun:false`.
4. כשסיימתם עמוד — קראו שוב ל-§2 עם `?after=<nextCursor>` מהתשובה הקודמת, וחזרו על 1-3. המשיכו עד ש-`nextCursor` חוזר `null` — זה סימן שעברתם על **כל** הקטלוג, לא רק על חלק ממנו.
5. אם רוצים לתעדף קודם את המקרים הכי דחופים לפני שממשיכים לשאר הקטלוג — אפשר להתחיל עם §3 (`products-needing-attention`) ולעבד אותם קודם, ואז לחזור לזרימה של §2 לכיסוי מלא.
6. **רק לבסוף**, אם המשתמש ביקש גם מוצרים חדשים לגמרי (SKU שלא קיים בכלל): `GET /api/integrations/product-enrich` לקטגוריות (§5) → `POST /api/integrations/products` עם `dryRun:true` (§6) → אחר כך `dryRun:false`.
7. דווחו למשתמש: כמה עמודים/מוצרים נסרקו סה"כ, כמה קיימים הושלמו, כמה מוצרים חדשים נוצרו (וממתינים לאישור פרסום ב-`/admin/inventory`), כמה נכשלו ולמה.
