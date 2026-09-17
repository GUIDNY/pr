import { z } from "zod";
import { DELIVERY_METHODS, exceptionalRemovalReasonSchema } from "@/lib/enums";

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
  // PELECARD is the gateway flow: the card is entered on Pelecard's page, so
  // this form has no card fields to validate — which is exactly why it needs
  // to be its own value rather than a DEMO_CARD with the fields left empty.
  paymentMethod: z.enum(["DEMO_CARD", "PELECARD", "CASH_ON_DELIVERY"]),
  cardNumber: z.string().optional(),
  cardExpiry: z.string().optional(),
  cardCvv: z.string().optional(),
  saveAddress: z.boolean().optional(),

  /* ---- Taking the old appliance away ----
     Product ids, not equipment groups. What a product entitles its buyer to
     hand over is read from the database when the order is written — a
     browser that could name the group could ask for a fridge's removal on a
     ₪20 cable, and the person who would discover that is the driver.

     Optional throughout, because a basket with nothing eligible in it sends
     none of this, and so does every order placed before the feature existed. */
  removalProductIds: z.array(z.string()).max(50).optional(),
  removalReasons: z.array(exceptionalRemovalReasonSchema).optional(),
  removalNotes: z.string().max(500).optional(),
  removalAcknowledged: z.boolean().optional(),
}).refine(
  /* A requested removal without the confirmation is refused rather than
     quietly recorded. The free removal rests on the old appliance being
     empty, disconnected and reachable, and an unconfirmed request is a van
     booked against a condition nobody agreed to. The checkout holds the
     payment form shut for the same reason; this is the half a replayed form
     cannot skip. */
  (data) => !data.removalProductIds?.length || data.removalAcknowledged === true,
  { message: "יש לאשר את תנאי הכנת המוצר לפינוי", path: ["removalAcknowledged"] },
).refine(
  (data) => data.deliveryMethod !== "DELIVERY" || (data.city && data.street && data.houseNo),
  { message: "יש להזין כתובת מלאה למשלוח", path: ["city"] }
).refine(
  // DEMO_CARD only. A PELECARD order carries no card details by design, and
  // requiring them here is what rejected every gateway order at the door.
  (data) => data.paymentMethod !== "DEMO_CARD" || (data.cardNumber && data.cardNumber.replace(/\s/g, "").length >= 12),
  { message: "מספר כרטיס לא תקין", path: ["cardNumber"] }
);

export type CheckoutInput = z.infer<typeof checkoutSchema>;
