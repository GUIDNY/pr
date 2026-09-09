import "server-only";
import type { Channel, Message, SendResult } from "./types";

/**
 * The three ways out, and what each of them is still missing.
 *
 * None of them is wired to a provider yet, and that is a deliberate stopping
 * point rather than an unfinished one. Every one of these needs an account,
 * a sender identity someone has verified, and a key — and for the two that
 * reach a phone it needs more than that: an SMS sender name registered in
 * Israel, and for WhatsApp a Business account with the message templates
 * approved by Meta before a single message may be sent to someone who has
 * not written to you first.
 *
 * So the shape is finished and the credentials are blank. Each channel says
 * exactly which variables it wants, the admin screen lists them, and the
 * first one that gets filled in starts working on its own — nothing else has
 * to change. Until then every send is logged as SKIPPED with the reason,
 * which is the honest record: the customer was not told, and here is why.
 */

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() !== "" ? value.trim() : null;
}

function missingFrom(names: string[]): string[] {
  return names.filter((name) => !env(name));
}

/**
 * Email.
 *
 * The lightest of the three to finish: one provider key and a from-address
 * on a domain whose SPF and DKIM records point at that provider. Without
 * those records the mail is sent and lands in spam, which is worse than not
 * sending it — the shop believes the customer was told.
 */
export const emailChannel: Channel = {
  id: "EMAIL",
  configured: () => missingFrom(["RESEND_API_KEY", "ORDER_EMAIL_FROM"]).length === 0,
  missing: () => missingFrom(["RESEND_API_KEY", "ORDER_EMAIL_FROM"]),
  async send(to: string, message: Message): Promise<SendResult> {
    const key = env("RESEND_API_KEY");
    const from = env("ORDER_EMAIL_FROM");
    if (!key || !from) return { ok: false, error: "email not configured" };

    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          from,
          to,
          subject: message.subject,
          text: message.body,
        }),
      });
      if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}`.slice(0, 300) };
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : "send failed" };
    }
  },
};

/**
 * SMS.
 *
 * Left without an implementation on purpose rather than written against a
 * guessed API. Israeli SMS goes through local aggregators — 019, Inforu,
 * SMS4Free and others — and they do not share a request shape, an
 * authentication scheme or an idea of what a successful reply looks like.
 * Writing one and hoping is how you find out at the worst moment that every
 * message has been failing silently.
 *
 * Name the provider and this is twenty lines.
 */
export const smsChannel: Channel = {
  id: "SMS",
  configured: () => missingFrom(["SMS_PROVIDER", "SMS_API_KEY", "SMS_SENDER"]).length === 0,
  missing: () => missingFrom(["SMS_PROVIDER", "SMS_API_KEY", "SMS_SENDER"]),
  async send(): Promise<SendResult> {
    return { ok: false, error: "ספק ה-SMS עוד לא חובר" };
  },
};

/**
 * WhatsApp.
 *
 * The one with a rule that is not technical. Meta only allows a business to
 * open a conversation using a template it has approved in advance, so
 * "ההזמנה שלך יצאה" has to exist as an approved template with named
 * variables before it can be sent to a customer who has not messaged first.
 * That approval is a form and a wait, not a line of code, and no key makes
 * it unnecessary.
 */
export const whatsappChannel: Channel = {
  id: "WHATSAPP",
  configured: () =>
    missingFrom(["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_TEMPLATE_NAMESPACE"])
      .length === 0,
  missing: () =>
    missingFrom(["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN", "WHATSAPP_TEMPLATE_NAMESPACE"]),
  async send(): Promise<SendResult> {
    return { ok: false, error: "וואטסאפ עסקי עוד לא חובר (נדרשים גם תבניות מאושרות מ-Meta)" };
  },
};

export const CHANNELS: Channel[] = [emailChannel, smsChannel, whatsappChannel];
