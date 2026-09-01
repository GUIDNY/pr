# `POST /api/internal/complaints/ingest`

What the WhatsApp bot calls so a complaint gets a place to live. Written for
whoever wires the n8n side; the code is in
`src/app/api/internal/complaints/ingest/route.ts`.

## The rule this endpoint exists under

**The customer never learns a complaint exists.** No ticket number reaches
them, no "we opened a case", no change in how the bot answers, no hint of any
kind. Two things follow, and both are the caller's responsibility as much as
this endpoint's:

1. **Call this after the reply has already been sent**, on a branch the reply
   does not wait for. Everything here can fail — the database, the storage
   bucket, the whole route — and the customer's conversation must be exactly
   what it would have been. This is why the response carries ids and flags
   only, and never message text: a caller that logs the response cannot leak
   the thread.
2. **The model's prompt says nothing about complaints, tickets or any
   internal system.** A model that does not know this exists cannot mention
   it. That half lives in n8n and is not in this repo.

## Auth

    x-internal-key: <INTERNAL_API_KEY>

Compared in constant time. A wrong or missing key is `401` with no detail.
The key is at least 32 bytes, lives only in Vercel's environment variables,
and never enters the repository. Generate one with:

    openssl rand -base64 48

The endpoint is not reachable from a browser, has no CORS, and must never
appear in client code.

## Request

```json
{
  "waId": "972501234567",
  "customerName": "עידן",
  "waMessageId": "wamid.HBgL...",
  "customerText": "הזמנתי מקרר לפני שבועיים והוא עדיין לא הגיע",
  "botReply": "אני מעביר אותך לנציג שיבדוק את זה",
  "intent": "complaint",
  "confidence": 0.82,
  "needsHuman": true,
  "mediaMime": null,
  "mediaBase64": null,
  "occurredAt": "2026-09-01T10:14:00.000Z"
}
```

`waId` is the only required field. Non-digits are stripped, so `+972…` works
too. `occurredAt` falls back to now when missing or unparseable.

## What it decides

**Opening.** A complaint is opened only when `needsHuman` is true, or
`intent` is `complaint` or `human_request`. Anything else returns
`{"created": false, "appended": false}` and writes nothing.

Two intents, deliberately. `order_status`, `returns` and `warranty` were on
this list in the first draft and came off: "מתי יגיע?" and "מה האחריות?" are
questions, and a queue that fills with questions is a queue nobody reads —
which is the failure this feature exists to fix, arrived at from the other
side.

The bot does not escalate on its own either. When it recognises a grievance
it asks the customer whether someone should look into it and sends
`needsHuman` only on a yes — except for someone who asked for a person or
said "תלונה" outright, who goes straight through. So by the time a request
arrives the customer has already agreed, and a second filter here would only
discard something they asked for. Note what that does *not* mean: the
customer was asked whether someone should look into their problem, which is
an ordinary thing to be asked. They are still never told a complaint record
exists, never given a ticket number, and never shown anything from this
system.

**Appending.** Once a complaint is open, **every** later message from that
`waId` joins it, whatever its intent. A "תודה" is part of the story, and a
thread with the calm parts filtered out misleads whoever reads it. The
opening gate applies to opening only.

**Which complaint.** The most recent one for that `waId` that is not
`RESOLVED` or `CLOSED` and whose last message is within 72 hours. Past that
window a new message opens a new complaint: someone who went quiet for four
days and came back is usually on a different subject, and stapling it to a
stale thread hides both.

**Idempotency.** `waMessageId` is unique. Sending the same one twice returns
`200` with `created:false, appended:false` and the id of the complaint it
already belongs to. Retry freely.

**Severity.** `CRITICAL` for a lawyer, the consumer authority, a threat to
publish, injury or property damage. `HIGH` for anger stated outright, or a
third customer message on a complaint still open. `MEDIUM` for a plain
grievance, `LOW` for a question. Rules, not a model call — this runs while
the request is open and a network hop here buys nothing a reader could not
see themselves. **Severity only ever rises automatically**; a person can
lower it from the admin, because they read the thread and the rules did not.

**Redaction.** Card numbers (13–19 digits passing Luhn), CVVs named as such,
and Israeli identity numbers passing their check digit are replaced with a
label before anything is written. The raw value is not stored anywhere — not
in a second column, not in a log. Both tests are checksums rather than
"a run of digits", so order numbers, prices, phone numbers and model codes
survive; a guard that ate those would make every thread unreadable.

**Media.** WhatsApp's own media URLs expire in minutes and need a bearer
token, so a stored URL is a dead link by the time anyone opens the complaint.
Send the bytes as `mediaBase64` instead; they go to a private Supabase bucket
and the admin mints a ten-minute signed URL per click. The cap is 10MB
decoded. If only `mediaMime` arrives, the admin shows "the customer sent a
file we did not keep" rather than pretending nothing was sent.

## Response

```json
{ "created": true, "appended": false, "complaintId": "cmt…", "ticketNumber": 1000, "severity": "HIGH" }
```

Never any message content.

## Checks

    npm run check:complaints                                  # rules only
    COMPLAINTS_BASE=http://localhost:3000 INTERNAL_API_KEY=… npm run check:complaints

The second form exercises the endpoint end to end: a greeting opens nothing,
a complaint opens one, a second message joins it, a repeated `waMessageId`
writes nothing, and a card number does not reach the database.
