import { z } from "zod";
import { DELIVERY_METHODS } from "@/lib/enums";

export const checkoutSchema = z.object({
  fullName: z.string().min(2, "יש להזין שם מלא"),
  email: z.email("כתובת אימייל לא תקינה"),
  phone: z.string().min(9, "מספר טלפון לא תקין"),
  deliveryMethod: z.enum(DELIVERY_METHODS),
  city: z.string().optional(),
  street: z.string().optional(),
  houseNo: z.string().optional(),
  apartment: z.string().optional(),
  deliveryNotes: z.string().optional(),
  paymentMethod: z.enum(["DEMO_CARD", "CASH_ON_DELIVERY"]),
  cardNumber: z.string().optional(),
  cardExpiry: z.string().optional(),
  cardCvv: z.string().optional(),
  saveAddress: z.boolean().optional(),
}).refine(
  (data) => data.deliveryMethod !== "DELIVERY" || (data.city && data.street && data.houseNo),
  { message: "יש להזין כתובת מלאה למשלוח", path: ["city"] }
).refine(
  (data) => data.paymentMethod !== "DEMO_CARD" || (data.cardNumber && data.cardNumber.replace(/\s/g, "").length >= 12),
  { message: "מספר כרטיס לא תקין", path: ["cardNumber"] }
);

export type CheckoutInput = z.infer<typeof checkoutSchema>;
