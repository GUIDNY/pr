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
}: {
  cartId: string;
  name: string | null;
  phone: string;
  titles: string[];
}) {
  return (
    <WhatsappReminder
      phone={phone}
      optIn={null}
      initialText={reminderText("CART", firstNameOf(name), productPhrase(titles))}
      record={() => updateCartFollowUpAction(cartId, "HANDLED", "נשלחה הודעת וואטסאפ")}
    />
  );
}
