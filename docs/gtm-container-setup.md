# What container GTM-5Z82SD4Z has to contain

Written 1 November 2026, after the advertising agency found that **no
custom event had reached GA4 in 28 days** — no purchase, no add to cart,
no begin checkout, no WhatsApp click — while the same clicks reached Meta
and Clarity normally.

That asymmetry is the whole diagnosis and it is worth stating plainly,
because it looks like a site bug and is not one:

- Meta and Clarity are called **directly** by the site's own code
  (`trackMeta`, the Clarity snippet). They never touch GTM.
- Everything Google gets goes through **`dataLayer.push`**, and a push is
  only a message left in a box. It reaches GA4 only if the container
  holds a trigger listening for that event name and a tag that forwards
  it.
- The **direct gtag install** (`components/analytics/google-analytics.tsx`)
  does not help: it sends page views and it does not read the dataLayer.
  Hence page views in GA4 and nothing else.

So the site is pushing correctly and the container is empty of the tags
that would carry it. Nothing below is a code change.

## Verified on our side first

| | |
|---|---|
| `NEXT_PUBLIC_GTM_ID` set for production | ✅ |
| Container loads on the live site | ✅ (after consent — see the trap) |
| `dataLayer.push` fires for all nine events | ✅ |

## The nine events the site pushes

Seven carry an `ecommerce` object; the shape is built in one place,
`lib/analytics/ga.ts`, and `item_id` is the SKU — the same value the
Merchant Center feed sends as `g:id`, so an advertised product and a sold
product are the same product to Google.

| `event` | payload | where from |
|---|---|---|
| `purchase` | `ecommerce`: `transaction_id`, `value`, `shipping`, `currency`, `items[]` | `ga-events.tsx` |
| `add_to_cart` | `ecommerce`: `value`, `items[]` | `lib/cart-client.ts` |
| `begin_checkout` | `ecommerce`: `value`, `coupon?`, `items[]` | `ga-events.tsx` |
| `view_item` | `ecommerce`: `value`, `items[]` | `ga-events.tsx` |
| `view_item_list` | `ecommerce`: `item_list_id`, `item_list_name`, `items[]` | `ga-events.tsx` |
| `view_cart` | `ecommerce`: `value`, `items[]` | `cart-drawer.tsx` |
| `remove_from_cart` | `ecommerce`: `value`, `items[]` | `cart-drawer.tsx` |
| `whatsapp_click` | `page_path` — **no** `ecommerce` | `contact-clicks.tsx` |
| `phone_click` | `page_path` — **no** `ecommerce` | `contact-clicks.tsx` |
| `form_submit` | `form_name`, `page_path` — **no** `ecommerce` | `lib/support-client.ts` |

`value` is always the goods — Σ(price × quantity) after discount, in ILS,
a number and never a string. Delivery is never folded in; on `purchase`
it is `shipping`, separately. Delivery is free above ₪600, so folding it
in would make `value` jump by ₪40 at the threshold for no change in what
was sold.

## What to build

One GA4 Configuration tag (if the container has none), then per event a
**Custom Event** trigger whose event name is the string in the table, and
a **GA4 Event** tag with the same name firing on it.

For the seven ecommerce events the tag must have **Send Ecommerce data →
Data Layer** ticked. Without it the event arrives with no items and no
value, which is worse than nothing: Google Ads then counts every sale at
its fallback of ₪1.

For the three plain events, send `page_path` (and `form_name`) as event
parameters. Nothing else is needed.

## Four traps, each of which makes a correct setup look broken

1. **Consent gates everything.** GTM is not loaded at all until the
   visitor accepts the cookie banner, and `pushEcommerce`/`pushEvent`
   both return early without consent. **Accept the banner before
   testing** — otherwise Preview shows an empty dataLayer and the
   conclusion is the opposite of the truth.
2. **`{ ecommerce: null }` is pushed before every ecommerce event.** That
   is deliberate: without it GTM merges the previous event's items into
   the next one and an add_to_cart of one product reports two. Do not
   "clean it up".
3. **`purchase` is reported twice on purpose** — once from the browser
   and once from the server (`lib/analytics/ga4-purchase.ts`), with the
   same `transaction_id` and the same `client_id`. That is the condition
   under which GA4 counts it once, and it is what covers a sale from a
   visitor whose ad blocker ate the browser event. Do not add
   deduplication in the container.
4. **Nothing fires inside the iOS app.** `isNativeApp()` returns true
   there and every push returns early.

## Verifying

1. GTM → **Preview**, point it at `https://buytoday.co.il`.
2. **Accept the cookie banner.** (Trap 1.)
3. Tap a WhatsApp link. `whatsapp_click` should appear in the Preview
   timeline with the GA4 tag fired.
4. GA4 → Reports → **Realtime** → the event appears within seconds.
5. Add a product to the basket and confirm `add_to_cart` carries items
   and a value, not an empty object.
6. **Publish the container.** Preview proves nothing about the live site.

## Then, in Google Ads (account 154-723-2645)

The conversions are imported from GA4 — the account shows **מקור: Google
Analytics (GA4)** — so there is no Google Ads tag to install and no
`AW-` conversion ID involved.

Agreed with the agency on 1 November:

| conversion | primary? | counting |
|---|---|---|
| `purchase` | primary | **every** conversion |
| `whatsapp_click` | primary | **one** — see below |
| `add_to_cart`, `begin_checkout`, `phone_click` | secondary, observation only | — |

The existing **"דף הצלחה"** conversion must be moved to secondary or
deleted: it is a thank-you-page view, it carries no value, and Google
falls back to ₪1 per sale. Import the `purchase` event instead.

`whatsapp_click` counts **one**, not every. The site reports every tap
with no deduplication — the listener in `contact-clicks.tsx` has no
"already sent" guard — and WhatsApp links appear in the header, the
drawer, the product page, the footer and the error page. One person
hesitating is otherwise three leads, and Google optimises toward finding
more of them.

`whatsapp_click` and `phone_click` must be marked as **key events in
GA4** before they can be imported as conversions at all.
