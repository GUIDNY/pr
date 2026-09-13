import "server-only";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { SITE_URL } from "@/lib/site-url";
import { BUSINESS } from "@/lib/business";
import { emailChannel } from "@/lib/notify/channels";

/**
 * "שכחתי סיסמה", end to end.
 *
 * Until now there was none at all: somebody locked out of their account had
 * no route back except ringing the shop, and the account holds their order
 * history and addresses.
 *
 * Four properties carry this, and each is a decision rather than a default.
 *
 * THE TOKEN IS NEVER STORED. What goes in the email is 32 random bytes; what
 * goes in the table is their SHA-256. So a copy of this table — a backup, a
 * dump, somebody reading over a shoulder in a support tool — is a list of
 * hashes, and a hash cannot be pasted into a URL. No stretching here and
 * none needed: unlike a password, this is full-entropy random, so there is
 * nothing to guess offline.
 *
 * IT SAYS THE SAME THING WHETHER OR NOT THE ACCOUNT EXISTS. A form that
 * answers "no such address" is a form that tells anybody who asks which of
 * their guesses are customers of this shop. The screen says a link was sent
 * if there was anywhere to send it, every time.
 *
 * ONE USE, ONE HOUR. Reset links travel through email, which is forwarded,
 * synced and left open on shared machines. An hour is long enough for
 * somebody to walk to their laptop and short enough that a link found later
 * is dead.
 *
 * USING ONE KILLS THE REST. Someone who asked three times and then finished
 * with the third has two live links sitting in their inbox; after this they
 * have none.
 */

const TOKEN_TTL_MS = 60 * 60 * 1000;

/* A second request inside a minute returns the same cheerful message and
   sends nothing. Not rate limiting in any serious sense — it stops a form
   held down from turning into a hundred emails to a real person, which is
   how a password reset becomes a way to harass somebody. */
const RESEND_COOLDOWN_MS = 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Create a link for this email address, and send it.
 *
 * Returns nothing about whether the address matched. The caller has nothing
 * to leak because it is never told.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await db.user.findUnique({ where: { email: email.toLowerCase().trim() } });
  if (!user) return;

  const recent = await db.passwordResetToken.findFirst({
    where: { userId: user.id, usedAt: null, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
  });
  if (recent) return;

  const token = randomBytes(32).toString("base64url");
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    },
  });

  const link = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const message = {
    subject: "איפוס הסיסמה שלך · Buy Today",
    body:
      `היי ${user.name.split(" ")[0]},\n` +
      `ביקשת לאפס את הסיסמה בחשבון שלך ב-Buy Today.\n` +
      `הקישור תקף לשעה אחת: ${link}\n\n` +
      `אם לא ביקשת — אפשר להתעלם מההודעה. הסיסמה הנוכחית נשארת כפי שהיא.`,
    html: resetEmailHtml(user.name.split(" ")[0], link),
  };

  /* Failures are swallowed on purpose. An error here would have to say
     something, and the only thing it could say is whether the address is
     registered — which is exactly what the silence above is protecting. The
     customer sees the same screen either way and can ask again. */
  try {
    await emailChannel.send(user.email, message);
  } catch {
    // deliberately silent
  }
}

export type ResetOutcome = { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" | "used" };

/** Check a token without spending it — for the page that renders the form. */
export async function inspectResetToken(token: string): Promise<ResetOutcome> {
  const row = await db.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row) return { ok: false, reason: "invalid" };
  if (row.usedAt) return { ok: false, reason: "used" };
  if (row.expiresAt.getTime() < Date.now()) return { ok: false, reason: "expired" };
  return { ok: true, userId: row.userId };
}

/**
 * Spend the token and set the new password, in one transaction.
 *
 * The update is conditioned on usedAt still being null, so two submissions
 * of the same form a moment apart cannot both succeed — the second finds
 * nothing to update and is refused. A check followed by a write would let
 * both through.
 */
export async function consumeResetToken(token: string, passwordHash: string): Promise<ResetOutcome> {
  const checked = await inspectResetToken(token);
  if (!checked.ok) return checked;

  const tokenHash = hashToken(token);
  const claimed = await db.passwordResetToken.updateMany({
    where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) return { ok: false, reason: "used" };

  await db.$transaction([
    db.user.update({
      where: { id: checked.userId },
      data: { passwordHash, hasPassword: true },
    }),
    // Every other link this person was sent stops working now.
    db.passwordResetToken.updateMany({
      where: { userId: checked.userId, usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);

  return checked;
}

function resetEmailHtml(firstName: string, link: string): string {
  const BRAND = "#f55305";
  const FONT = "'Segoe UI', Arial, Helvetica, sans-serif";
  /* Same construction as the order emails: tables, inline styles, and dir on
     every element rather than only on <html> — Gmail drops <html> and grafts
     the rest into its own left-to-right document. */
  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>איפוס סיסמה</title></head>
<body dir="rtl" bgcolor="#f5f4f2" style="margin:0;padding:0;background:#f5f4f2;direction:rtl;">
<table role="presentation" dir="rtl" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f4f2;direction:rtl;">
  <tr><td align="center" style="text-align:center;padding:30px 12px;">
    <table role="presentation" dir="rtl" width="560" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;text-align:right;width:560px;max-width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
      <tr><td bgcolor="${BRAND}" style="text-align:right;background:${BRAND};background-image:linear-gradient(135deg,#f95c0d 0%,#f34f01 100%);padding:26px 28px;">
        <div style="font-family:${FONT};font-size:22px;font-weight:700;color:#ffffff;">איפוס הסיסמה שלך</div>
      </td></tr>
      <tr><td style="text-align:right;padding:26px 28px 0;">
        <div style="font-family:${FONT};font-size:16px;color:#1f2328;">היי ${firstName},</div>
        <div style="font-family:${FONT};font-size:15px;color:#6b7280;line-height:1.75;padding-top:8px;">
          ביקשת לאפס את הסיסמה בחשבון שלך. הקישור תקף לשעה אחת ולשימוש אחד בלבד.
        </div>
      </td></tr>
      <tr><td align="center" style="text-align:center;padding:24px 28px 0;">
        <table role="presentation" dir="rtl" cellpadding="0" cellspacing="0" border="0" style="direction:rtl;margin:0 auto;">
          <tr><td align="center" bgcolor="${BRAND}" style="text-align:center;background:${BRAND};background-image:linear-gradient(135deg,#f95c0d 0%,#f34f01 100%);border-radius:12px;">
            <a href="${link}" style="display:inline-block;padding:14px 36px;font-family:${FONT};font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">בחירת סיסמה חדשה</a>
          </td></tr>
        </table>
      </td></tr>
      <tr><td style="text-align:right;padding:22px 28px 28px;">
        <div style="font-family:${FONT};font-size:13px;color:#6b7280;line-height:1.75;">
          לא ביקשת את זה? אפשר להתעלם מההודעה — הסיסמה הנוכחית נשארת כפי שהיא, ואף אחד לא נכנס לחשבון.
          <br>שאלה? ${BUSINESS.phone}
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
