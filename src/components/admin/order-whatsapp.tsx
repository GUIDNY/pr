"use client";

import { WhatsappReminder } from "./whatsapp-reminder";
import { recordOrderWhatsappAction } from "@/actions/admin-whatsapp";
import { firstNameOf, productPhrase, reminderText } from "@/lib/notify/wa-reminder";

export function OrderWhatsapp({
  orderId,
  name,
  phone,
  optIn,
  titles,
}: {
  orderId: string;
  name: string | null;
  phone: string;
  optIn: boolean | null;
  titles: string[];
}) {
  return (
    <WhatsappReminder
      phone={phone}
      optIn={optIn}
      initialText={reminderText("PAYMENT", firstNameOf(name), productPhrase(titles))}
      record={() => recordOrderWhatsappAction(orderId)}
    />
  );
}
