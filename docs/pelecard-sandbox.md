# Pelecard — sandbox integration

Card clearing through Pelecard, wired end to end and pointed at the test
gateway. Nothing here charges a real card, and switching it to one takes two
deliberate changes to the environment, not a code change.

## The one thing to understand first

Pelecard has **no separate test credentials**. The same terminal, user and
password work against both environments, and the only difference between a test
and a real charge is the host:

| | |
|---|---|
| test / QA | `https://gateway20.pelecard.biz` |
| production | `https://gateway21.pelecard.biz` |

So the host is read from `PELECARD_BASE_URL` and from nowhere else, and both
hostnames are written down in exactly one file, `src/lib/pelecard/gateway.ts`.
Never hard-code either anywhere else — a stray string left behind on the day of
the switch is a real charge nobody meant to make.

On top of that, pointing `PELECARD_BASE_URL` at the production host does
nothing unless `PELECARD_ALLOW_PRODUCTION=I_UNDERSTAND` is also set. Without it
every payment path throws before a request is sent.

## Environment variables

| variable | what it is |
|---|---|
| `PELECARD_TERMINAL` `PELECARD_USER` `PELECARD_PASSWORD` | terminal credentials. Server-side only, never `NEXT_PUBLIC_` |
| `PELECARD_BASE_URL` | the gateway host, exactly one of the two above |
| `PELECARD_ALLOW_PRODUCTION` | must be `I_UNDERSTAND` to use the production host |
| `PELECARD_ENABLED` | `true` switches checkout onto the gateway. Anything else keeps the existing demo flow |
| `PELECARD_CALLBACK_SECRET` | ours, not Pelecard's. Carried in the callback URL so the endpoint can tell a real notification from a forged one. `openssl rand -hex 32` |
| `NEXT_PUBLIC_SITE_URL` | the public site address. Pelecard builds the customer's return links and the server-side callback URL from it |

Recommended while testing:

| | Development | Preview | Production |
|---|---|---|---|
| `PELECARD_BASE_URL` | gateway20 | gateway20 | gateway20 |
| `PELECARD_ALLOW_PRODUCTION` | — | — | — |
| `PELECARD_ENABLED` | `true` | `true` | `false` |

**Preview builds in this project need more than the Pelecard variables.** Env
vars here are set for Production only, so a Preview deployment has no
`DATABASE_URL` and the build fails at `/sitemap.xml` before it ever reaches
payments. To test on a Preview URL, `DATABASE_URL`, `AUTH_SECRET` and
`NEXT_PUBLIC_SITE_URL` have to be set for Preview too — and
`NEXT_PUBLIC_SITE_URL` must be that deployment's own URL, or Pelecard will send
the customer back to production.

## The flow

1. The customer fills in the checkout form. **It has no card fields** — with
   the gateway on, the card is entered on Pelecard's page. This site never
   sees, transmits or stores a card number.
2. `createOrderAction` writes the order as `PAYMENT_PENDING` / `PENDING` and
   returns it. The cart is deliberately **not** emptied yet.
3. `POST /api/pelecard/checkout` opens the payment — the amount comes from the
   order in the database, never from the request — and returns Pelecard's URL.
4. The customer pays on Pelecard's page and is sent back to
   `/checkout/success/<orderNumber>`, `/checkout/error` or `/checkout/cancelled`.
5. Pelecard **also** POSTs to `/api/pelecard/callback`. That callback, and
   nothing else, marks the order paid. The customer's return marks nothing.
6. The confirmation page polls `/api/pelecard/status` for up to 30 seconds,
   because the callback often lands a second or two after the redirect. Once
   the order is captured the cart is emptied.

### What the callback checks, and why

| check | the forgery it stops |
|---|---|
| the secret in the callback URL | anyone POSTing to a public endpoint |
| order already captured → no-op | a redelivered callback paying twice |
| `PelecardStatusCode === "000"` | a decline recorded as a sale |
| charged sum equals the sum we sent, in agorot | a payment for ₪1 on a ₪7,910 order |
| `ValidateByUniqueKey` against Pelecard | a forged body that claims `"000"` |

The amount is compared against `Payment.amountAgorot` — the integer we sent —
and never against the float on the order. `toAgorot()` is the only place money
is converted.

### The shape the notification actually arrives in

Not the one the documentation describes for the browser return. The server-side
notification is nested, and every field the checks above depend on lives inside
`ResultData` under a different name:

```json
{
  "StatusCode": "000",
  "ErrorMessage": "",
  "ResultData": {
    "TransactionId": "5c3f9c94-…",       // the GUID GetTransaction accepts
    "TransactionPelecardId": "3081963254", // a different id — not interchangeable
    "AdditionalDetailsParamX": "<order id>",
    "UserKey": "<order id>",
    "DebitTotal": "14990",                // agorot — this is TotalX100
    "DebitApproveNumber": "1234567",      // this is ApprovalNo
    "ConfirmationKey": "…",
    "ShvaResult": "000"
  }
}
```

Read flat, `PelecardStatusCode`, `ParamX` and `TotalX100` are all `undefined`,
and the callback would fail an approved payment on `undefined !== "000"` — the
customer sent to the error page for a card that was charged. `normalizeFeedback()`
in `src/lib/pelecard/client.ts` is the single place that translation happens;
the flat form is still accepted, because that is what the browser gets.

The scenario suite posts this exact envelope, captured from a live sandbox
transaction. That matters: every other assertion in the file posts a shape we
invented, which is precisely why the earlier ones all passed while the real
payload broke.

## Testing

**Automated** (everything that does not need the live gateway):

```bash
PELECARD_TEST_DB=<db url> PELECARD_CALLBACK_SECRET=<same as the server> \
  npm run check:pelecard
```

`NODE_OPTIONS=--conditions=react-server` is not optional and is why that is a
script rather than a bare `tsx` call: without it the suite dies partway through
on `server-only`, after printing a screenful of passes — which reads like a
crash at the end rather than a third of the checks never running.

with the app running against that database. It writes test orders — never point
it at production.

**By hand, through the gateway**: `/admin/pelecard-test`, which exists only
when the configured gateway is the test one (the proxy returns a real 404
otherwise). It creates a throwaway order, lets you force any result through
`QAResultStatus`, and lists the last 20 sandbox payments with their full raw
responses.

Test card `458045804580`, any future expiry as MMYY, any 3-digit CVV.

## Cutover to production

1. Every scenario passes against gateway20, including a real payment, a
   decline, a cancellation and a timeout.
2. Invoicing is in place — an Israeli sale needs an invoice, and Pelecard
   integrates with iCount, EZCount and Payper.
3. The legal pages are current: terms, cancellation and returns policy,
   privacy policy, business details.
4. 3DSecure is settled with Pelecard for the terminal.
5. RLS is enabled on the Supabase tables. It is off on 33 of them today,
   including `Order` and `Payment`.
6. Only then: `PELECARD_BASE_URL=https://gateway21.pelecard.biz`,
   `PELECARD_ALLOW_PRODUCTION=I_UNDERSTAND`, `PELECARD_ENABLED=true` — and the
   admin console stops existing in that build by itself.
