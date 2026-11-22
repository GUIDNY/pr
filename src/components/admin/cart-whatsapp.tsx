"use client";

import { WhatsappReminder } from "./whatsapp-reminder";
import { updateCartFollowUpAction } from "@/actions/admin-abandoned-carts";
import { firstNameOf, productPhrase, reminderText } from "@/lib/notify/wa-reminder";

/** Abandoned cart: opening the message marks the cart handled, so two people
    do not write to the same customer. */
export function CartWhatsapp({
  cartId,
  name,
  phone,
  titles,
  paymentAttempted = false,
}: {
  cartId: string;
  name: string | null;
  phone: string;
  titles: string[];
  /** The customer reached payment and was declined: the text says so. */
  paymentAttempted?: boolean;
}) {
  return (
    <WhatsappReminder
      phone={phone}
      optIn={null}
      initialText={reminderText(paymentAttempted ? "PAYMENT" : "CART", firstNameOf(name), productPhrase(titles))}
      record={() => updateCartFollowUpAction(cartId, "HANDLED", "נשלחה הודעת וואטסאפ")}
    />
  );
}
