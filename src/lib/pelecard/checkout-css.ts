/**
 * The stylesheet Pelecard's hosted payment page loads.
 *
 * Their page accepts a `CssURL` at init, and it does not have to be one of
 * theirs — so this is how the last screen of the checkout stops looking like a
 * different company's form. It is the screen where the customer is deciding
 * whether to trust us with a card number, and until now it was the only one in
 * the whole shop that did not look like the shop.
 *
 * It is written against plain elements — inputs, selects, buttons, fieldsets —
 * rather than their class names, which are not documented and which their own
 * stylesheet is free to rename. Their sheet is imported first and kept as the
 * base layout, so anything not overridden here still behaves as it did.
 *
 * Served from a route rather than /public because the import has to follow
 * whichever gateway is configured: hard-coding the host here would leave
 * exactly one string still pointing at the test server after go-live.
 */
export function pelecardCheckoutCss(gatewayBaseUrl: string): string {
  return `@import url("${gatewayBaseUrl}/Content/Css/variant-he-4.css");
@import url("https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;600;700&display=swap");

/* ---- the shop's palette, in hex ----------------------------------------
   Not oklch, which is what the site itself uses: this page is rendered by
   somebody else's markup on somebody else's domain, and an older browser that
   cannot parse the colour would fall back to no styling at all. */
:root {
  --ai-brand: #e9631f;
  --ai-brand-hover: #d5551a;
  --ai-navy: #262f63;
  --ai-ink: #1f1c19;
  --ai-muted: #6f6a65;
  --ai-border: #e4e1de;
  --ai-bg: #f7f6f4;
  --ai-surface: #ffffff;
  --ai-danger: #d92d20;
  --ai-radius: 14px;
}

/* ---- page ---- */
html, body {
  background: var(--ai-bg) !important;
  color: var(--ai-ink) !important;
  font-family: "Heebo", system-ui, -apple-system, "Segoe UI", Arial, sans-serif !important;
  -webkit-font-smoothing: antialiased;
}

body {
  padding: 16px !important;
}

/* The form itself becomes a card, centred, with room to breathe. Max-width so
   the fields do not stretch across a desktop monitor, which is what makes a
   payment form feel like a spreadsheet. */
form {
  max-width: 560px !important;
  margin: 0 auto !important;
  background: var(--ai-surface) !important;
  border: 1px solid var(--ai-border) !important;
  border-radius: 20px !important;
  padding: 28px 24px !important;
  box-shadow: 0 1px 2px rgba(31, 28, 25, .04), 0 12px 32px -12px rgba(31, 28, 25, .14) !important;
}

h1, h2, h3, legend {
  font-family: inherit !important;
  color: var(--ai-ink) !important;
  font-weight: 700 !important;
}

/* ---- fields ----
   Their default is a bottom rule per field, which reads as a form to fill in
   rather than a box to type in, and on a phone gives nothing to aim at. A real
   bordered box with a 48px target is the difference. */
input[type="text"],
input[type="tel"],
input[type="number"],
input[type="email"],
input[type="password"],
input:not([type]),
select,
textarea {
  width: 100% !important;
  box-sizing: border-box !important;
  min-height: 48px !important;
  padding: 10px 14px !important;
  background: var(--ai-surface) !important;
  color: var(--ai-ink) !important;
  border: 1.5px solid var(--ai-border) !important;
  border-radius: var(--ai-radius) !important;
  /* 16px so iOS does not zoom the page when a field is focused. */
  font-size: 16px !important;
  font-family: inherit !important;
  line-height: 1.4 !important;
  transition: border-color .15s ease, box-shadow .15s ease !important;
  appearance: none;
  -webkit-appearance: none;
}

select {
  /* Room for the chevron on the correct side in RTL. */
  padding-inline-start: 38px !important;
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236f6a65' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") !important;
  background-repeat: no-repeat !important;
  background-position: left 12px center !important;
}

input::placeholder, textarea::placeholder { color: var(--ai-muted) !important; opacity: 1 !important; }

input:focus, select:focus, textarea:focus {
  outline: none !important;
  border-color: var(--ai-brand) !important;
  box-shadow: 0 0 0 3px rgba(233, 99, 31, .18) !important;
}

/* Keyboard focus stays visible for anyone not using a mouse — the site itself
   is built to WCAG 2.2 AA and this page is part of the same purchase. */
a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible {
  outline: 3px solid var(--ai-brand) !important;
  outline-offset: 2px !important;
}

label {
  display: block !important;
  margin-bottom: 6px !important;
  color: var(--ai-muted) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}

fieldset {
  border: 1px solid var(--ai-border) !important;
  border-radius: var(--ai-radius) !important;
  padding: 12px !important;
  margin: 0 0 4px !important;
}

legend { font-size: 13px !important; color: var(--ai-muted) !important; font-weight: 500 !important; padding: 0 6px !important; }

/* ---- errors ----
   Red text alone is not an error message anyone can act on, and it is also the
   one thing a colour-blind customer cannot see. Weight and size carry it too. */
.error, .field-error, [class*="error"], [class*="Error"], span[style*="red"] {
  color: var(--ai-danger) !important;
  font-size: 13.5px !important;
  font-weight: 500 !important;
  margin-top: 4px !important;
}

input.error, select.error, input[aria-invalid="true"], select[aria-invalid="true"] {
  border-color: var(--ai-danger) !important;
  box-shadow: 0 0 0 3px rgba(217, 45, 32, .14) !important;
}

/* ---- buttons ----
   One obvious action. The pay button is the shop's orange, full width, and
   large enough to hit with a thumb; cancel is quiet and secondary, because a
   payment form with two equally loud buttons is a payment form people misclick. */
button, input[type="submit"], input[type="button"], .btn, a.button {
  font-family: inherit !important;
  font-size: 17px !important;
  font-weight: 700 !important;
  min-height: 52px !important;
  padding: 12px 24px !important;
  border-radius: var(--ai-radius) !important;
  border: 1.5px solid transparent !important;
  cursor: pointer !important;
  transition: background-color .15s ease, transform .08s ease, box-shadow .15s ease !important;
}

button[type="submit"], input[type="submit"], button.submit, .btn-primary {
  width: 100% !important;
  background: var(--ai-brand) !important;
  color: #fff !important;
  box-shadow: 0 8px 20px -8px rgba(233, 99, 31, .55) !important;
}

button[type="submit"]:hover, input[type="submit"]:hover, .btn-primary:hover {
  background: var(--ai-brand-hover) !important;
}

button[type="submit"]:active, input[type="submit"]:active { transform: translateY(1px) !important; }

button[type="button"], input[type="button"], .btn-secondary, .cancel, [class*="cancel"] {
  background: transparent !important;
  color: var(--ai-muted) !important;
  border-color: var(--ai-border) !important;
  box-shadow: none !important;
}

button[type="button"]:hover, input[type="button"]:hover { background: var(--ai-bg) !important; }

button[disabled], input[disabled] { opacity: .5 !important; cursor: not-allowed !important; }

/* ---- the amount ----
   The number the customer is agreeing to. It should be the most legible thing
   on the page and unmistakably not an input field. */
[class*="total"], [class*="Total"], [class*="amount"], [class*="Amount"], [class*="sum"] {
  background: rgba(38, 47, 99, .05) !important;
  border: 1px solid rgba(38, 47, 99, .14) !important;
  border-radius: var(--ai-radius) !important;
  color: var(--ai-navy) !important;
  font-weight: 700 !important;
  font-size: 26px !important;
  padding: 14px 18px !important;
  text-align: center !important;
}

/* ---- the shop's logo ---- */
img[src*="logo"], .logo img, #logo img {
  max-height: 56px !important;
  width: auto !important;
  margin: 0 auto 18px !important;
  display: block !important;
}

/* ---- the card marks at the foot ---- */
img[src*="card"], img[src*="visa"], img[src*="master"], img[src*="isracard"] {
  max-height: 28px !important;
  width: auto !important;
  filter: saturate(.9);
}

a { color: var(--ai-brand) !important; text-decoration-thickness: 1px; text-underline-offset: 2px; }

/* ---- phones ----
   Where most of this checkout happens. */
@media (max-width: 600px) {
  body { padding: 8px !important; }
  form { padding: 20px 16px !important; border-radius: 16px !important; box-shadow: none !important; }
  button, input[type="submit"] { min-height: 54px !important; }
}

/* ---- honour the customer's own settings ---- */
@media (prefers-reduced-motion: reduce) {
  * { transition: none !important; animation: none !important; }
}
`;
}
