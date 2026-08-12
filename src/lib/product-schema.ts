import { z } from "zod";
import { STOCK_STATUSES } from "@/lib/enums";

export const productSchema = z.object({
  title: z.string().min(2, "יש להזין כותרת"),
  slug: z.string().min(2, "יש להזין slug"),
  sku: z.string().min(1, "יש להזין מק\"ט"),
  model: z.string().optional(),
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
