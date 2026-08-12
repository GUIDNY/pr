# PREC — next-generation ecommerce platform

A ground-up rebuild of [prec.co.il](https://www.prec.co.il), an Israeli electronics
retailer: a premium, RTL-first Hebrew storefront plus a full internal
order-management / admin back office. Built with Next.js 16 (App Router),
TypeScript, Tailwind v4, shadcn/ui, and Prisma.

The catalog structure (15 departments, ~90 subcategories), brand list, phone
number, and CTA color were extracted directly from the live site's HTML/CSS —
see `src/lib/category-tree.ts` for the sourced category tree.

## Stack

- **Next.js 16** (App Router, Turbopack, Server Actions, async `params`/`cookies`)
- **TypeScript**, **Tailwind CSS v4**, **shadcn/ui** (RTL-aware primitives)
- **Prisma 7** with the `better-sqlite3` driver adapter for zero-config local dev
  (schema is written to be a straightforward swap to Postgres — see
  `prisma/schema.prisma`'s header comment)
- **Zustand** for cart/compare client state, **Zod** for validation
- **jose** + **bcryptjs** for a hand-rolled JWT session (no external auth
  provider credentials were available)
- **Recharts** for the admin dashboard chart

## Getting started

```bash
npm install
npm run db:seed   # creates dev.db and seeds demo data (idempotent)
npm run dev
```

Visit `http://localhost:3000`. Admin is at `/admin/login`.

**Demo logins** (from the seed script):

| Role | Email | Password |
|---|---|---|
| Admin | admin@prec.co.il | admin123 |
| Staff | staff@prec.co.il | staff123 |
| Customer | eitan@example.com | demo1234 |

To wipe and reseed: `npm run db:reset`.

## What's implemented

**Storefront**: homepage (hero, category explorer, deals, best sellers, brand
strip, why-PREC), mega menu + mobile nav, live search dropdown, category
pages with dynamic per-category filters (brand/price/stock/spec attributes),
product pages (specs tabs, reviews, compare, consultation callback form),
cart (drawer + page), guest/account checkout with a demo payment adapter,
order tracking by order number + phone/email, customer account (orders,
addresses, favorites), a guided "product finder" with a real scoring engine
for refrigerators/TVs/washing machines, and a product comparison tray.

**Admin**: role-gated `/admin`, dashboard (revenue chart, attention-needed
orders, top products, category performance), searchable/filterable orders
table, an order detail command center (status workflow with full history,
internal/customer notes, staff assignment, payment/delivery info), product
CRUD (create/edit/publish/duplicate), and lightweight promotions/suppliers
management. Every mutating admin action writes to `AuditLog`.

**Data model**: `prisma/schema.prisma` — full relational schema (products,
categories with a dynamic per-category attribute system, brands, suppliers,
orders with a real status-history workflow, promotions, reviews, CMS pages,
homepage content sections, audit log). SQLite has no native enum type, so
status/role fields are `String` columns backed by the TS unions + Zod schemas
in `src/lib/enums.ts` — the single source of truth for every "enum".

## Known simplifications (by design, given no external credentials)

- **Payment**: `DEMO_CARD` is a UI-only adapter — no real gateway is called,
  and card numbers/CVV are never persisted (only a masked last-4 reference).
- **WhatsApp**: the consult flow deliberately doesn't deep-link to a `wa.me`
  number, since no real business WhatsApp number was available to verify —
  it logs a `SupportRequest` with `channel: WHATSAPP` for staff follow-up instead.
- **Product photography**: no real product images were scraped (to avoid
  hammering the live site and to avoid presenting AI-generated images as if
  they were real product photos). `ProductImagePlaceholder` renders a
  category-icon tile instead; `ProductImage` rows are ready for real URLs
  whenever photography is available.
- **QA**: no browser-automation tool was available in this environment, so
  verification was route-by-route (every page checked for HTTP 200, a clean
  `next build`, and a clean `tsc --noEmit`) plus close code review, rather
  than interactive click-through screenshots.
