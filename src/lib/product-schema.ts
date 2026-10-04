import { z } from "zod";
import { STOCK_STATUSES } from "@/lib/enums";

export const productSchema = z.object({
  title: z.string().min(2, "יש להזין כותרת"),
  slug: z.string().min(2, "יש להזין slug"),
  sku: z.string().min(1, "יש להזין מק\"ט"),
  model: z.string().optional(),
  /* The barcode. Digits only, 8 to 14 of them, separators tolerated; blank
     means none. The feed and the JSON-LD send it only when it is exactly
     the thirteen of an EAN-13 — see validGtin — so a UPC typed here is
     kept but not advertised. */
  gtin13: z.preprocess(
    (v) => (typeof v === "string" ? v.replace(/[\s-]/g, "") || null : v),
    z.string().regex(/^\d{8,14}$/, "ברקוד (GTIN): ספרות בלבד, 8 עד 14").nullable().optional(),
  ),
  brandId: z.string().min(1, "יש לבחור מותג"),
  categoryId: z.string().min(1, "יש לבחור קטגוריה"),
  supplierId: z.string().optional(),
  price: z.coerce.number().positive("המחיר חייב להיות חיובי"),
  compareAtPrice: z.coerce.number().optional().nullable(),
  stockStatus: z.enum(STOCK_STATUSES),
  stockQty: z.coerce.number().int().min(0),
  warrantyMonths: z.coerce.number().int().min(0),
  deliveryDays: z.coerce.number().int().min(0),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  isPublished: z.boolean(),
  isFeatured: z.boolean(),
  isBestSeller: z.boolean(),
});

export type ProductInput = z.infer<typeof productSchema>;
