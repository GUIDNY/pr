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
 * Email, through whichever of two backends is configured.
 *
 * Gmail first, because it is the one that can be switched on this afternoon:
 * an address and an app password, no domain records, no account approval. It
 * is a real stopgap and not a toy — mail genuinely sends — but it is a
 * stopgap, and the reasons are worth writing down rather than discovering:
 *
 *   The From address will be the Gmail address. Gmail rewrites From to the
 *   authenticated account unless the alias has been verified in its settings,
 *   so "buytoday.co.il" on the envelope is not something the password alone
 *   buys.
 *
 *   Free Gmail stops at roughly 500 recipients a day, Workspace at 2,000.
 *   Fine for order notifications at this shop's volume, and the ceiling is
 *   real: past it Google locks sending for 24 hours rather than queueing.
 *
 *   Commercial mail from a gmail.com address lands in spam more often than
 *   the same mail from a domain whose SPF and DKIM point at a sender. That
 *   is what "something real" fixes.
 *
 * Both live here at once on purpose. A provider key and a from-address is
 * strictly better, so it wins whenever both are present, and the switchover
 * is one variable in Vercel with nothing else to change and nothing to
 * migrate.
 */
type EmailBackend = "resend" | "gmail" | null;

function emailBackend(): EmailBackend {
  if (env("RESEND_API_KEY") && env("ORDER_EMAIL_FROM")) return "resend";
  if (env("GMAIL_USER") && env("GMAIL_APP_PASSWORD")) return "gmail";
  return null;
}

export const emailChannel: Channel = {
  id: "EMAIL",
  configured: () => emailBackend() !== null,
  missing: () =>
    emailBackend() !== null
      ? []
      : // Names the easy one. Listing both sets side by side reads as "you
        // need five variables" when in fact you need either two or the other
        // two, and the wrong impression there is what stops it being done.
        ["GMAIL_USER", "GMAIL_APP_PASSWORD (סיסמת אפליקציה, לא הסיסמה הרגילה)"],
  async send(to: string, message: Message): Promise<SendResult> {
    const backend = emailBackend();
    if (backend === "resend") return sendViaResend(to, message);
    if (backend === "gmail") return sendViaGmail(to, message);
    return { ok: false, error: "email not configured" };
  },
};

async function sendViaResend(to: string, message: Message): Promise<SendResult> {
  const key = env("RESEND_API_KEY")!;
  const from = env("ORDER_EMAIL_FROM")!;
  /* Where a reply goes, when the From address is not a mailbox anybody reads.
     orders@ on a sending domain usually is not one — Resend verifies a domain
     for sending and that says nothing about receiving — so without this a
     customer pressing reply is writing into a void, and pressing reply is
     what a customer does when something is wrong with their order.
     Unset is fine and means replies go to the From address, which is right
     once that address is a real mailbox. */
  const replyTo = env("ORDER_EMAIL_REPLY_TO");
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: message.subject,
        text: message.body,
        ...(message.html ? { html: message.html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}`.slice(0, 300) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "send failed" };
  }
}

async function sendViaGmail(to: string, message: Message): Promise<SendResult> {
  const user = env("GMAIL_USER")!;
  const pass = env("GMAIL_APP_PASSWORD")!;
  try {
    /* Imported here rather than at the top of the file so that a deployment
       without Gmail configured never loads an SMTP client it will not use —
       this module is pulled in by the order actions, which run on every
       approval. */
    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: env("ORDER_EMAIL_FROM") ?? `Buy Today <${user}>`,
      to,
      subject: message.subject,
      text: message.body,
      ...(message.html ? { html: message.html } : {}),
      ...(env("ORDER_EMAIL_REPLY_TO") ? { replyTo: env("ORDER_EMAIL_REPLY_TO")! } : {}),
    });
    return { ok: true };
  } catch (error) {
    const raw = error instanceof Error ? error.message : "send failed";
    /* Gmail's answer to a normal account password is a 535, and it is the
       mistake everybody makes first. Saying so here saves the half hour of
       assuming the address is wrong. */
    return {
      ok: false,
      error: raw.includes("535")
        ? "ג'ימייל דחה את ההתחברות. צריך סיסמת אפליקציה (App Password) ולא את הסיסמה הרגילה, ואימות דו-שלבי חייב להיות פעיל."
        : raw.slice(0, 300),
    };
  }
}

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
 * WhatsApp, through Meta's Cloud API.
 *
 * The rule that is not technical: a business may open a conversation only
 * with a template Meta approved in advance. The four are in WhatsApp
 * Manager — order_received, payment_approved, order_shipped,
 * order_delivered, Hebrew, numbered slots — and messages.ts fills their
 * slots. Two variables switch it on: the phone number's ID and a system
 * user token. A template name that differs from the default is set per
 * event, e.g. WHATSAPP_TEMPLATE_ORDER_SHIPPED.
 *
 * Meta answers a template with the wrong number of slots with an error,
 * not a silent drop, and the error lands in the order's notification log
 * where it can be read.
 */
const WHATSAPP_TEMPLATE_DEFAULTS: Record<string, string> = {
  ORDER_RECEIVED: "order_received",
  PAYMENT_APPROVED: "payment_approved",
  SHIPPED: "order_shipped",
  DELIVERED: "order_delivered",
};

/** An Israeli number as the API wants it: digits only, country code first. */
export function whatsappRecipient(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0") && digits.length >= 9) return "972" + digits.slice(1);
  if (digits.length >= 8) return digits;
  return null;
}

export const whatsappChannel: Channel = {
  id: "WHATSAPP",
  configured: () => missingFrom(["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN"]).length === 0,
  missing: () => missingFrom(["WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_TOKEN"]),
  async send(to: string, message: Message): Promise<SendResult> {
    if (!message.template) return { ok: false, error: "להודעה הזאת אין תבנית וואטסאפ" };
    const recipient = whatsappRecipient(to);
    if (!recipient) return { ok: false, error: `מספר טלפון לא תקין: ${to}` };
    const name = env(`WHATSAPP_TEMPLATE_${message.template.event}`) ?? WHATSAPP_TEMPLATE_DEFAULTS[message.template.event];
    const language = env("WHATSAPP_TEMPLATE_LANG") ?? "he";
    const version = env("WHATSAPP_API_VERSION") ?? "v22.0";
    try {
      const res = await fetch(`https://graph.facebook.com/${version}/${env("WHATSAPP_PHONE_NUMBER_ID")}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${env("WHATSAPP_TOKEN")}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: recipient,
          type: "template",
          template: {
            name,
            language: { code: language },
            components: [
              {
                type: "body",
                // Meta refuses newlines and runs of spaces inside a slot.
                parameters: message.template.params.map((text) => ({ type: "text", text: text.replace(/\s+/g, " ").trim() })),
              },
            ],
          },
        }),
      });
      if (res.ok) return { ok: true };
      const detail = await res.text().catch(() => "");
      let reason = detail.slice(0, 300);
      try {
        const parsed = JSON.parse(detail) as { error?: { message?: string; error_data?: { details?: string } } };
        reason = parsed.error?.error_data?.details ?? parsed.error?.message ?? reason;
      } catch {
        /* not JSON — keep the raw text */
      }
      return { ok: false, error: `Meta ${res.status}: ${reason}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "WhatsApp send failed" };
    }
  },
};

export const CHANNELS: Channel[] = [emailChannel, smsChannel, whatsappChannel];
