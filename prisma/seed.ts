import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { CATEGORY_TREE } from "../src/lib/category-tree";
import { hashPassword } from "../src/lib/auth-seed-helpers";

const adapter = new PrismaPg(process.env.DATABASE_URL!);
const db = new PrismaClient({ adapter });

// ---------- helpers ----------

function pick<T>(arr: T[], seed: number) {
  return arr[seed % arr.length];
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

const BRANDS = [
  { name: "Bosch", desc: "מותג גרמני מוביל למוצרי חשמל, איכות ואמינות לאורך שנים." },
  { name: "Siemens", desc: "טכנולוגיה גרמנית מתקדמת למוצרי חשמל לבית ולמטבח." },
  { name: "LG", desc: "חדשנות קוריאנית במסכים, קירור וכביסה." },
  { name: "Samsung", desc: "מובילה עולמית בטכנולוגיה, מסכים ומוצרי חשמל חכמים." },
  { name: "Electrolux", desc: "מותג שוודי בעל מסורת ארוכה במוצרי חשמל לבית." },
  { name: "AEG", desc: "מותג פרימיום אירופאי לעיצוב וביצועים." },
  { name: "Gorenje", desc: "מוצרי חשמל סלובניים בעיצוב ייחודי." },
  { name: "Sharp", desc: "טכנולוגיה יפנית מתקדמת." },
  { name: "Sony", desc: "חוויית בידור ואודיו ברמה עולמית." },
  { name: "Delonghi", desc: "מותג איטלקי מוביל בעולם הקפה והמטבח." },
  { name: "Haier", desc: "מוצרי חשמל וקירור בטכנולוגיה מתקדמת." },
  { name: "Smeg", desc: "עיצוב איטלקי אייקוני למטבח." },
  { name: "TCL", desc: "מסכים וטלוויזיות חכמות במחיר משתלם." },
  { name: "Hitachi", desc: "טכנולוגיה יפנית איכותית למקררים ומזגנים." },
] as const;

const SUPPLIERS = [
  { name: "יבואן ראשי - אלקטרו-טרייד בע\"מ", contactName: "אבי כהן", phone: "03-9123456", leadTimeDays: 5 },
  { name: "מחסן מרכזי פר", contactName: "לוגיסטיקה", phone: "04-6639510", leadTimeDays: 2 },
  { name: "ספק חלופי - נורדיק סחר", contactName: "מיכל לוי", phone: "09-7712345", leadTimeDays: 10 },
];

type Tier = "budget" | "mid" | "premium";

const CATEGORY_PRICE_TIERS: Record<string, [number, number]> = {
  "small-kitchen-appliances": 150, // base handled below per-leaf overrides
} as unknown as Record<string, [number, number]>;

// price range + installment eligibility per leaf-category "class"
const PRICE_RULES: { match: RegExp; range: [number, number]; installments?: number[] }[] = [
  { match: /^fridge-|freezers|wine-fridge/, range: [2990, 12990], installments: [6, 12, 24] },
  { match: /^washing-machines|dryers|washer-dryer-combo/, range: [1990, 6990], installments: [6, 12] },
  { match: /^dishwasher-/, range: [2490, 5990], installments: [6, 12] },
  { match: /oven|cooktops|range-hoods/, range: [1490, 6990], installments: [6, 12] },
  { match: /^tvs$/, range: [1990, 9990], installments: [6, 12, 24] },
  { match: /projectors|projector-screens/, range: [990, 5990], installments: [6, 12] },
  { match: /tv-mounts|tv-stands|cables/, range: [89, 690] },
  { match: /soundbars|receivers-amplifiers/, range: [690, 4990], installments: [6, 12] },
  { match: /speakers|subwoofers|portable-speakers/, range: [149, 2490] },
  { match: /headphones/, range: [79, 1490] },
  { match: /bluray-streamers/, range: [199, 890] },
  { match: /microwaves/, range: [349, 1690] },
  { match: /toaster-ovens|sandwich-toasters|pop-up-toasters/, range: [89, 890] },
  { match: /kettles|hot-plates/, range: [69, 490] },
  { match: /air-fryers/, range: [299, 1290] },
  { match: /bread-makers|juicers|mixers|meat-grinders|food-processors|blenders/, range: [149, 1290] },
  { match: /coffee-machines/, range: [399, 3990], installments: [6, 12] },
  { match: /milk-frothers|coffee-grinders/, range: [89, 590] },
  { match: /vacuum-cleaners/, range: [349, 2990], installments: [6, 12] },
  { match: /irons/, range: [129, 890] },
  { match: /mosquito-killers/, range: [59, 249] },
  { match: /water-dispensers/, range: [349, 1290] },
  { match: /smart-lighting/, range: [89, 690] },
  { match: /split-ac|central-ac/, range: [2490, 7990], installments: [6, 12, 24] },
  { match: /portable-ac/, range: [1290, 2990], installments: [6, 12] },
  { match: /radiators|heaters|heat-fans|heating-blankets/, range: [99, 890] },
  { match: /fans|ceiling-fans/, range: [99, 690] },
  { match: /tablets|gaming-consoles/, range: [890, 3990], installments: [6, 12] },
  { match: /cordless-phones|landline-phones/, range: [99, 490] },
  { match: /security-cameras/, range: [249, 1990], installments: [6, 12] },
  { match: /shavers|hair-clippers|epilators|hair-straighteners|hair-dryers|hair-curlers/, range: [89, 890] },
];

function priceFor(slug: string, seed: number): { price: number; compareAt: number | null; installments: number[] | null } {
  const rule: { match?: RegExp; range: [number, number]; installments?: number[] } =
    PRICE_RULES.find((r) => r.match.test(slug)) ?? { range: [199, 1990] };
  const [min, max] = rule.range;
  const span = max - min;
  const price = Math.round((min + (span * ((seed * 37) % 100)) / 100) / 10) * 10;
  const onSale = seed % 3 === 0;
  const compareAt = onSale ? Math.round((price * (1.12 + ((seed % 5) * 0.03))) / 10) * 10 : null;
  const installments = rule.installments ?? null;
  return { price, compareAt, installments };
}

const MODEL_LETTERS = ["WAN", "WGG", "KGN", "GSN", "RB", "SBS", "OHF", "IND", "TFS", "MW", "AF", "VC"];

function modelCode(seed: number) {
  const letters = pick(MODEL_LETTERS, seed);
  const num = 10000 + ((seed * 137) % 89999);
  return `${letters}${num}`;
}

async function main() {
  console.log("Seeding PREC demo data...");

  // ---------- wipe (dev-only, FK-safe order) ----------
  await db.auditLog.deleteMany();
  await db.orderStatusHistory.deleteMany();
  await db.orderNote.deleteMany();
  await db.payment.deleteMany();
  await db.orderItem.deleteMany();
  await db.order.deleteMany();
  await db.cartItem.deleteMany();
  await db.cart.deleteMany();
  await db.favorite.deleteMany();
  await db.review.deleteMany();
  await db.productAttributeValue.deleteMany();
  await db.productImage.deleteMany();
  await db.product.deleteMany();
  await db.categoryAttribute.deleteMany();
  await db.category.deleteMany();
  await db.brand.deleteMany();
  await db.supplier.deleteMany();
  await db.promotion.deleteMany();
  await db.supportRequest.deleteMany();
  await db.address.deleteMany();
  await db.user.deleteMany();
  await db.cmsPage.deleteMany();
  await db.homepageSection.deleteMany();

  // ---------- brands ----------
  const brandBySlug = new Map<string, { id: string }>();
  for (const b of BRANDS) {
    const brand = await db.brand.create({
      data: { name: b.name, slug: slugify(b.name), description: b.desc },
    });
    brandBySlug.set(slugify(b.name), brand);
  }
  const brandList = Array.from(brandBySlug.values());

  // ---------- suppliers ----------
  const supplierRows = [];
  for (const s of SUPPLIERS) {
    supplierRows.push(
      await db.supplier.create({
        data: { name: s.name, contactName: s.contactName, phone: s.phone, leadTimeDays: s.leadTimeDays },
      })
    );
  }

  // ---------- categories ----------
  const leafCategoryByS_slug = new Map<string, { id: string; slug: string }>();
  let deptOrder = 0;
  for (const dept of CATEGORY_TREE) {
    const deptRow = await db.category.create({
      data: {
        name: dept.name,
        slug: dept.slug,
        icon: dept.icon,
        isFeatured: true,
        sortOrder: deptOrder++,
      },
    });
    let childOrder = 0;
    for (const child of dept.children) {
      const childRow = await db.category.create({
        data: {
          name: child.name,
          slug: child.slug,
          parentId: deptRow.id,
          sortOrder: childOrder++,
        },
      });
      leafCategoryByS_slug.set(child.slug, childRow);
    }
  }

  // ---------- category attributes (dynamic specs) for key categories ----------
  const attributeSets: Record<string, { key: string; label: string; unit?: string; inputType?: string; options?: string[] }[]> = {
    "fridge-top-freezer,fridge-bottom-freezer,fridge-side-by-side,fridge-3-door,fridge-4-door,fridge-integrated": [
      { key: "capacity", label: "נפח כולל", unit: "ליטר" },
      { key: "width", label: "רוחב", unit: 'ס"מ' },
      { key: "doors", label: "מספר דלתות" },
      { key: "freezer_location", label: "מיקום מקפיא", inputType: "select", options: ["עליון", "תחתון", "לא רלוונטי"] },
      { key: "color", label: "צבע", inputType: "select", options: ["נירוסטה", "לבן", "שחור", "silver"] },
      { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+"] },
    ],
    tvs: [
      { key: "screen_size", label: "גודל מסך", unit: '"' },
      { key: "panel", label: "טכנולוגיית מסך", inputType: "select", options: ["OLED", "QLED", "LED", "Mini-LED"] },
      { key: "resolution", label: "רזולוציה", inputType: "select", options: ["HD", "Full HD", "4K", "8K"] },
      { key: "smart_os", label: "מערכת הפעלה", inputType: "select", options: ["Google TV", "Tizen", "webOS", "Android TV"] },
      { key: "refresh_rate", label: "קצב רענון", unit: "Hz" },
    ],
    "washing-machines,dryers,washer-dryer-combo": [
      { key: "capacity", label: "קיבולת", unit: 'ק"ג' },
      { key: "rpm", label: "סל\"ד סחיטה" },
      { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+"] },
      { key: "width", label: "רוחב", unit: 'ס"מ' },
    ],
    "dishwasher-standard,dishwasher-semi-integrated,dishwasher-fully-integrated": [
      { key: "place_settings", label: "מערכות כלים" },
      { key: "programs", label: "מספר תוכניות" },
      { key: "noise_level", label: "רמת רעש", unit: "dB" },
    ],
    "split-ac,portable-ac,central-ac": [
      { key: "btu", label: "כושר קירור", unit: "BTU" },
      { key: "inverter", label: "טכנולוגיה", inputType: "select", options: ["אינוורטר", "רגיל"] },
      { key: "energy_rating", label: "דירוג אנרגטי", inputType: "select", options: ["A+++", "A++", "A+"] },
    ],
  };

  const categoryAttrIds = new Map<string, { id: string; key: string }[]>();
  for (const [slugsCsv, attrs] of Object.entries(attributeSets)) {
    const slugs = slugsCsv.split(",");
    for (const slug of slugs) {
      const cat = leafCategoryByS_slug.get(slug);
      if (!cat) continue;
      const rows = [];
      let order = 0;
      for (const a of attrs) {
        const row = await db.categoryAttribute.create({
          data: {
            categoryId: cat.id,
            key: a.key,
            label: a.label,
            unit: a.unit,
            inputType: a.inputType ?? "text",
            options: a.options ? JSON.stringify(a.options) : null,
            sortOrder: order++,
          },
        });
        rows.push({ id: row.id, key: row.key });
      }
      categoryAttrIds.set(slug, rows);
    }
  }

  // ---------- products ----------
  let seed = 1;
  let skuCounter = 100000;
  const allLeafSlugs = CATEGORY_TREE.flatMap((d) => d.children.map((c) => c.slug));
  const createdProducts: { id: string; slug: string; price: number; categorySlug: string }[] = [];

  for (const dept of CATEGORY_TREE) {
    for (const child of dept.children) {
      const cat = leafCategoryByS_slug.get(child.slug)!;
      const productsInLeaf = 2 + (seed % 2); // 2-3 per leaf
      for (let i = 0; i < productsInLeaf; i++) {
        seed++;
        skuCounter++;
        const brand = pick(brandList, seed);
        const brandName = Array.from(brandBySlug.entries()).find(([, v]) => v.id === brand.id)![0];
        const model = modelCode(seed);
        const { price, compareAt, installments } = priceFor(child.slug, seed);
        const title = `${child.name} ${brandName.toUpperCase()} ${model}`;
        const slug = `${child.slug}-${slugify(brandName)}-${model}`.toLowerCase();
        const stockRoll = seed % 10;
        const stockStatus = stockRoll < 7 ? "IN_STOCK" : stockRoll < 9 ? "LOW_STOCK" : "OUT_OF_STOCK";
        const supplier = pick(supplierRows, seed);

        const product = await db.product.create({
          data: {
            sku: `PR-${skuCounter}`,
            title,
            slug,
            model,
            brandId: brand.id,
            categoryId: cat.id,
            shortDescription: `${child.name} מבית ${brandName} — איכות, ביצועים ואחריות יבואן רשמי.`,
            description: `${title} הוא הבחירה המושלמת ל${child.name}. המוצר מגיע עם אחריות יבואן רשמי, משלוח עד הבית והתקנה במקרים הרלוונטיים. מוצר איכותי מבית ${brandName}, מהמותגים המובילים בעולם מוצרי החשמל.`,
            price,
            compareAtPrice: compareAt,
            installmentMonths: installments ? installments[installments.length - 1] : null,
            warrantyMonths: 12 + (seed % 3 === 0 ? 12 : 0),
            deliveryDays: 3 + (seed % 5),
            stockStatus,
            stockQty: stockStatus === "OUT_OF_STOCK" ? 0 : stockStatus === "LOW_STOCK" ? 1 + (seed % 3) : 5 + (seed % 40),
            isPublished: true,
            isFeatured: seed % 11 === 0,
            isBestSeller: seed % 7 === 0,
            ratingAvg: stockStatus === "OUT_OF_STOCK" ? 0 : Math.round((3.6 + (seed % 14) / 10) * 10) / 10,
            ratingCount: stockStatus === "OUT_OF_STOCK" ? 0 : 3 + (seed % 120),
            supplierId: supplier.id,
            supplierSku: `SUP-${skuCounter}`,
            supplierCost: Math.round(price * 0.62),
          },
        });

        // dynamic spec values, where the leaf category has an attribute set
        const attrs = categoryAttrIds.get(child.slug);
        if (attrs) {
          for (const attr of attrs) {
            let value = "";
            switch (attr.key) {
              case "capacity":
                value = /washing-machines|dryers|washer-dryer-combo/.test(child.slug)
                  ? String(6 + ((seed * 13) % 7)) // kg
                  : String(180 + ((seed * 13) % 400)); // liters
                break;
              case "width":
                value = String(45 + ((seed * 3) % 45));
                break;
              case "doors":
                value = child.slug.includes("4-door") ? "4" : child.slug.includes("3-door") ? "3" : "2";
                break;
              case "freezer_location":
                value = child.slug.includes("bottom") ? "תחתון" : child.slug.includes("top") ? "עליון" : "לא רלוונטי";
                break;
              case "color":
                value = pick(["נירוסטה", "לבן", "שחור", "silver"], seed);
                break;
              case "energy_rating":
                value = pick(["A+++", "A++", "A+"], seed);
                break;
              case "screen_size":
                value = String(pick([32, 43, 50, 55, 65, 75, 85], seed));
                break;
              case "panel":
                value = pick(["OLED", "QLED", "LED", "Mini-LED"], seed);
                break;
              case "resolution":
                value = pick(["Full HD", "4K", "4K", "8K"], seed);
                break;
              case "smart_os":
                value = pick(["Google TV", "Tizen", "webOS", "Android TV"], seed);
                break;
              case "refresh_rate":
                value = String(pick([60, 100, 120, 144], seed));
                break;
              case "rpm":
                value = String(pick([1000, 1200, 1400, 1600], seed));
                break;
              case "place_settings":
                value = String(pick([12, 13, 14, 15], seed));
                break;
              case "programs":
                value = String(4 + (seed % 6));
                break;
              case "noise_level":
                value = String(38 + (seed % 12));
                break;
              case "btu":
                value = String(pick([9000, 12000, 18000, 24000], seed));
                break;
              case "inverter":
                value = pick(["אינוורטר", "רגיל"], seed);
                break;
              default:
                value = "-";
            }
            await db.productAttributeValue.create({
              data: { productId: product.id, attributeId: attr.id, value },
            });
          }
        }

        // a couple of reviews on featured/best-seller items
        if ((product.isFeatured || product.isBestSeller) && stockStatus !== "OUT_OF_STOCK") {
          const reviewCount = 1 + (seed % 3);
          const names = ["דנה כהן", "יוסי לוי", "מיכל אברהם", "רועי שרון", "נועה פרץ"];
          for (let r = 0; r < reviewCount; r++) {
            await db.review.create({
              data: {
                productId: product.id,
                authorName: pick(names, seed + r),
                rating: 4 + ((seed + r) % 2),
                title: pick(["מרוצה מאוד", "שווה כל שקל", "המלצה חמה", "מוצר איכותי"], seed + r),
                body: "קניתי לפני כמה חודשים, המוצר עובד מעולה והשירות של PREC היה מצוין מהזמנה ועד משלוח.",
              },
            });
          }
        }

        createdProducts.push({ id: product.id, slug: product.slug, price: product.price, categorySlug: child.slug });
      }
    }
  }
  console.log(`Created ${createdProducts.length} products across ${allLeafSlugs.length} categories.`);

  // ---------- users ----------
  const adminPass = await hashPassword("admin123");
  const admin = await db.user.create({
    data: { email: "admin@prec.co.il", passwordHash: adminPass, name: "מנהל המערכת", role: "ADMIN" },
  });
  const staffPass = await hashPassword("staff123");
  const staff = await db.user.create({
    data: { email: "staff@prec.co.il", passwordHash: staffPass, name: "רותם - שירות לקוחות", role: "STAFF" },
  });
  const custPass = await hashPassword("demo1234");
  const customers: { user: Awaited<ReturnType<typeof db.user.create>>; address: Awaited<ReturnType<typeof db.address.create>> }[] = [];
  const custNames = [
    { name: "איתן ישראלי", email: "eitan@example.com", phone: "0501234567" },
    { name: "שירה בן דוד", email: "shira@example.com", phone: "0527654321" },
    { name: "עומר גולן", email: "omer@example.com", phone: "0541122334" },
  ];
  for (const c of custNames) {
    const user = await db.user.create({
      data: { email: c.email, passwordHash: custPass, name: c.name, phone: c.phone, role: "CUSTOMER" },
    });
    const address = await db.address.create({
      data: {
        userId: user.id,
        fullName: c.name,
        phone: c.phone,
        city: pick(["תל אביב", "רמת גן", "חיפה", "ראשון לציון", "פתח תקווה"], seed++),
        street: pick(["הרצל", "ויצמן", "בן גוריון", "ז'בוטינסקי", "רוטשילד"], seed++),
        houseNo: String(1 + (seed % 90)),
        isDefault: true,
      },
    });
    customers.push({ user, address });
  }

  // ---------- promotions ----------
  await db.promotion.create({
    data: { name: "קופון ברוכים הבאים", code: "PREC10", type: "PERCENTAGE", value: 10, scope: "CART", minCartAmount: 300, isActive: true },
  });
  const fridgeDept = leafCategoryByS_slug.get("fridge-bottom-freezer");
  await db.promotion.create({
    data: { name: "מבצע קירור", type: "PERCENTAGE", value: 8, scope: "CATEGORY", scopeRefId: fridgeDept?.id, isActive: true },
  });

  // ---------- demo orders (every workflow state) ----------
  function orderTotal(items: { product: (typeof createdProducts)[number]; qty: number }[]) {
    return items.reduce((sum, it) => sum + it.product.price * it.qty, 0);
  }

  async function createDemoOrder(opts: {
    number: string;
    user?: (typeof customers)[number];
    guest?: { name: string; email: string; phone: string };
    items: { product: (typeof createdProducts)[number]; qty: number }[];
    status: string;
    paymentStatus: string;
    daysAgo: number;
    assignedTo?: { id: string };
    supplierId?: string;
    customerNote?: string;
    internalNote?: string;
    history: { status: string; daysAgoOffset: number; note?: string }[];
  }) {
    const subtotal = orderTotal(opts.items);
    const createdAt = new Date(Date.now() - opts.daysAgo * 86400000);
    const order = await db.order.create({
      data: {
        orderNumber: opts.number,
        userId: opts.user?.user.id,
        guestName: opts.guest?.name,
        guestEmail: opts.guest?.email,
        guestPhone: opts.guest?.phone,
        addressId: opts.user?.address.id,
        status: opts.status,
        subtotal,
        deliveryFee: subtotal > 500 ? 0 : 49,
        total: subtotal + (subtotal > 500 ? 0 : 49),
        paymentStatus: opts.paymentStatus,
        paymentMethod: "DEMO_CARD",
        assignedToId: opts.assignedTo?.id,
        supplierId: opts.supplierId,
        customerNote: opts.customerNote,
        createdAt,
        updatedAt: createdAt,
      },
    });
    for (const it of opts.items) {
      const full = await db.product.findUniqueOrThrow({ where: { id: it.product.id } });
      await db.orderItem.create({
        data: {
          orderId: order.id,
          productId: it.product.id,
          titleSnap: full.title,
          skuSnap: full.sku,
          priceSnap: full.price,
          quantity: it.qty,
        },
      });
    }
    if (opts.internalNote) {
      await db.orderNote.create({
        data: { orderId: order.id, authorId: admin.id, body: opts.internalNote, isInternal: true },
      });
    }
    for (const h of opts.history) {
      await db.orderStatusHistory.create({
        data: {
          orderId: order.id,
          toStatus: h.status,
          changedById: admin.id,
          note: h.note,
          createdAt: new Date(Date.now() - h.daysAgoOffset * 86400000),
        },
      });
    }
    if (opts.paymentStatus === "CAPTURED" || opts.paymentStatus === "REFUNDED") {
      await db.payment.create({
        data: { orderId: order.id, provider: "DEMO", amount: order.total, status: opts.paymentStatus === "REFUNDED" ? "REFUNDED" : "CAPTURED", reference: `DEMO-${opts.number}` },
      });
    }
    return order;
  }

  const byCat = (slug: string) => createdProducts.filter((p) => p.categorySlug === slug);
  const fridgeProduct = byCat("fridge-bottom-freezer")[0] ?? createdProducts[0];
  const tvProduct = byCat("tvs")[0] ?? createdProducts[1];
  const washerProduct = byCat("washing-machines")[0] ?? createdProducts[2];
  const kettleProduct = byCat("kettles")[0] ?? createdProducts[3];
  const acProduct = byCat("split-ac")[0] ?? createdProducts[4];
  const microwaveProduct = byCat("microwaves")[0] ?? createdProducts[5];
  const vacProduct = byCat("vacuum-cleaners")[0] ?? createdProducts[6];

  await createDemoOrder({
    number: "PR-100001",
    user: customers[0],
    items: [{ product: tvProduct, qty: 1 }],
    status: "NEW",
    paymentStatus: "PENDING",
    daysAgo: 0,
    history: [{ status: "NEW", daysAgoOffset: 0 }],
  });

  await createDemoOrder({
    number: "PR-100002",
    user: customers[1],
    items: [{ product: kettleProduct, qty: 1 }, { product: microwaveProduct, qty: 1 }],
    status: "PAID",
    paymentStatus: "CAPTURED",
    daysAgo: 1,
    assignedTo: staff,
    history: [
      { status: "NEW", daysAgoOffset: 1 },
      { status: "PAID", daysAgoOffset: 0.9, note: "תשלום אושר אוטומטית" },
    ],
  });

  await createDemoOrder({
    number: "PR-100003",
    user: customers[2],
    items: [{ product: fridgeProduct, qty: 1 }],
    status: "AWAITING_SUPPLIER",
    paymentStatus: "CAPTURED",
    daysAgo: 3,
    assignedTo: staff,
    supplierId: supplierRows[0].id,
    internalNote: "המקרר בצבע שחור אזל אצל הספק הראשי, ממתינים לאישור אספקה חלופית.",
    history: [
      { status: "NEW", daysAgoOffset: 3 },
      { status: "PAID", daysAgoOffset: 2.8 },
      { status: "PROCESSING", daysAgoOffset: 2.5 },
      { status: "AWAITING_SUPPLIER", daysAgoOffset: 1, note: "פנייה לספק לגבי זמינות" },
    ],
  });

  await createDemoOrder({
    number: "PR-100004",
    user: customers[0],
    items: [{ product: washerProduct, qty: 1 }],
    status: "READY_FOR_DELIVERY",
    paymentStatus: "CAPTURED",
    daysAgo: 4,
    assignedTo: staff,
    history: [
      { status: "NEW", daysAgoOffset: 4 },
      { status: "PAID", daysAgoOffset: 3.8 },
      { status: "PROCESSING", daysAgoOffset: 3 },
      { status: "SUPPLIER_CONFIRMED", daysAgoOffset: 2 },
      { status: "READY_FOR_DELIVERY", daysAgoOffset: 0.5 },
    ],
  });

  await createDemoOrder({
    number: "PR-100005",
    guest: { name: "טל אורן", email: "tal.oren@example.com", phone: "0509988776" },
    items: [{ product: acProduct, qty: 2 }],
    status: "SHIPPED",
    paymentStatus: "CAPTURED",
    daysAgo: 6,
    assignedTo: staff,
    history: [
      { status: "NEW", daysAgoOffset: 6 },
      { status: "PAID", daysAgoOffset: 5.8 },
      { status: "PROCESSING", daysAgoOffset: 5 },
      { status: "READY_FOR_DELIVERY", daysAgoOffset: 3 },
      { status: "SHIPPED", daysAgoOffset: 0.4, note: "שליח: יעקב, צפי הגעה מחר עד 14:00" },
    ],
  });

  await createDemoOrder({
    number: "PR-100006",
    user: customers[1],
    items: [{ product: vacProduct, qty: 1 }],
    status: "DELIVERED",
    paymentStatus: "CAPTURED",
    daysAgo: 10,
    assignedTo: staff,
    history: [
      { status: "NEW", daysAgoOffset: 10 },
      { status: "PAID", daysAgoOffset: 9.8 },
      { status: "PROCESSING", daysAgoOffset: 9 },
      { status: "SHIPPED", daysAgoOffset: 8 },
      { status: "DELIVERED", daysAgoOffset: 7, note: "נמסר ללקוח, נחתם אישור קבלה" },
    ],
  });

  await createDemoOrder({
    number: "PR-100007",
    user: customers[2],
    items: [{ product: microwaveProduct, qty: 1 }],
    status: "CANCELLED",
    paymentStatus: "PENDING",
    daysAgo: 5,
    internalNote: "הלקוח ביטל - מצא מחיר טוב יותר במתחרה.",
    history: [
      { status: "NEW", daysAgoOffset: 5 },
      { status: "CANCELLED", daysAgoOffset: 4.5, note: "בוטל לבקשת הלקוח" },
    ],
  });

  await createDemoOrder({
    number: "PR-100008",
    guest: { name: "רונית שגיא", email: "ronit.sagi@example.com", phone: "0533344556" },
    items: [{ product: kettleProduct, qty: 1 }],
    status: "REFUNDED",
    paymentStatus: "REFUNDED",
    daysAgo: 14,
    internalNote: "מוצר הגיע פגום, בוצע זיכוי מלא כולל דמי משלוח.",
    history: [
      { status: "NEW", daysAgoOffset: 14 },
      { status: "PAID", daysAgoOffset: 13.8 },
      { status: "DELIVERED", daysAgoOffset: 12 },
      { status: "REFUND_PENDING", daysAgoOffset: 11, note: "הלקוח דיווח על נזק בהובלה" },
      { status: "REFUNDED", daysAgoOffset: 10 },
    ],
  });

  // an order "requiring attention": paid a long time ago but stuck in PROCESSING
  await createDemoOrder({
    number: "PR-100009",
    user: customers[0],
    items: [{ product: fridgeProduct, qty: 1 }, { product: washerProduct, qty: 1 }],
    status: "PROCESSING",
    paymentStatus: "CAPTURED",
    daysAgo: 9,
    assignedTo: staff,
    internalNote: "⚠ תקוע בטיפול 9 ימים - לבדוק מול הספק בדחיפות.",
    history: [
      { status: "NEW", daysAgoOffset: 9 },
      { status: "PAID", daysAgoOffset: 8.8 },
      { status: "PROCESSING", daysAgoOffset: 8 },
    ],
  });

  // ---------- support requests ----------
  await db.supportRequest.create({
    data: { name: "דניאל מזרחי", phone: "0521239876", channel: "CALLBACK", topic: "בחירת מקרר", message: "מחפש מקרר 4 דלתות עד 12000 ש\"ח", status: "OPEN" },
  });
  await db.supportRequest.create({
    data: { name: "אורלי בכר", phone: "0587651234", channel: "WHATSAPP", topic: "מעקב הזמנה", status: "CONTACTED" },
  });

  // ---------- CMS pages (matching real site's nav: תקנון / אודותינו / סניפים / מאמרים) ----------
  await db.cmsPage.create({
    data: {
      slug: "about",
      title: "אודותינו",
      body: "PREC - פר אלקטרוניקה, פועלת שנים רבות כחנות מוצרי חשמל, אלקטרוניקה וקולנוע ביתי המשרתת מגוון רחב של לקוחות ברחבי הארץ. אנו מציעים קשת נרחבת של מוצרים - ממוצרי חשמל בסיסיים ועד מוצרים יוקרתיים, במחירים תחרותיים ועם שירות אישי.",
    },
  });
  await db.cmsPage.create({
    data: {
      slug: "terms",
      title: "תקנון האתר",
      body: "תקנון האתר יעודכן בהתאם למדיניות העסקית והמשפטית העדכנית של PREC.",
    },
  });
  await db.cmsPage.create({
    data: {
      slug: "branches",
      title: "סניפים",
      body: "לבירור סניפים קרובים ושעות פעילות ניתן ליצור קשר בטלפון 04-6639510.",
    },
  });
  await db.cmsPage.create({
    data: {
      slug: "articles",
      title: "מאמרים",
      body: "מדריכי קנייה וטיפים לבחירת מוצרי חשמל יעודכנו בקרוב.",
    },
  });

  // ---------- homepage sections ----------
  await db.homepageSection.create({
    data: {
      key: "hero",
      title: "המחיר הכי טוב על מוצרי החשמל שאתם צריכים",
      subtitle: "משלוח עד הבית, אחריות יבואן רשמי ושירות לקוחות אמיתי",
      payload: JSON.stringify({ ctaLabel: "לצפייה במבצעים", ctaHref: "/deals" }),
      sortOrder: 0,
    },
  });
  await db.homepageSection.create({
    data: {
      key: "why-prec",
      title: "למה לקנות ב-PREC",
      payload: JSON.stringify([
        { title: "משלוח עד הבית", body: "משלוח מהיר לכל הארץ, כולל התקנה למוצרים גדולים." },
        { title: "אחריות יבואן רשמי", body: "כל המוצרים מגיעים עם אחריות מלאה של היבואן הרשמי." },
        { title: "שירות לקוחות אמיתי", body: "צוות שירות זמין בטלפון 04-6639510 לכל שאלה." },
        { title: "מגוון ענק של מותגים", body: "Bosch, Siemens, LG, Samsung, Electrolux ועוד עשרות מותגים מובילים." },
      ]),
      sortOrder: 1,
    },
  });

  console.log("Seed complete.");
  console.log("Admin login: admin@prec.co.il / admin123");
  console.log("Staff login: staff@prec.co.il / staff123");
  console.log("Customer login: eitan@example.com / demo1234");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
