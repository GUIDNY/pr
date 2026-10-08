-- The BuyToday balance (יתרה לקניות): WalletTopup and WalletEntry.
--
-- Run ONCE, by the owner, against the production database, BEFORE
-- WALLET_ENABLED is switched on. Nothing reads these tables while the flag is
-- off, so the code can be deployed first and this run afterwards. Running it
-- twice is harmless: every statement is guarded.
--
-- Two ways to run it:
--   npm run db:wallet              # prints these statements, changes nothing
--   npm run db:wallet -- --apply   # runs them through the site's own client
-- or paste this file into the Supabase SQL editor.
--
-- The tables are what `prisma migrate diff --from-empty --to-schema
-- prisma/schema.prisma --script` prints for the two models, word for word,
-- plus what it cannot know (see scripts/create-game-profile-table.ts for the
-- same reasoning): IF NOT EXISTS and guarded constraints, CHECKs that keep
-- the ledger honest at the database level, and row level security enabled
-- with no policies so Supabase's public REST API cannot read or write a
-- customer's money. Prisma connects as the owner, which RLS does not apply to.
--
-- Statements are separated by a blank line after the semicolon; the script
-- splits on exactly that, so keep it when editing.

CREATE TABLE IF NOT EXISTS "WalletTopup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "paidAgorot" INTEGER NOT NULL,
    "creditAgorot" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "environment" TEXT,
    "confirmationKey" TEXT,
    "pelecardTransactionId" TEXT,
    "pelecardStatusCode" TEXT,
    "approvalNo" TEXT,
    "cardLast4" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalletTopup_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletTopup_status_check" CHECK ("status" IN ('PENDING', 'PAID', 'FAILED')),
    CONSTRAINT "WalletTopup_amounts_check" CHECK ("paidAgorot" > 0 AND "creditAgorot" >= "paidAgorot")
);

CREATE TABLE IF NOT EXISTS "WalletEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amountAgorot" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" TEXT,
    "topupId" TEXT,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "WalletEntry_kind_check" CHECK ("kind" IN ('TOPUP', 'BONUS', 'SPEND', 'REFUND', 'ADJUST')),
    -- The sign follows the kind, so a bug cannot write a SPEND that adds money.
    CONSTRAINT "WalletEntry_sign_check" CHECK (
        ("kind" IN ('TOPUP', 'BONUS', 'REFUND') AND "amountAgorot" > 0)
        OR ("kind" = 'SPEND' AND "amountAgorot" < 0)
        OR ("kind" = 'ADJUST' AND "amountAgorot" <> 0)
    ),
    -- Every SPEND and REFUND belongs to an order, every TOPUP and BONUS to a top-up.
    CONSTRAINT "WalletEntry_link_check" CHECK (
        ("kind" IN ('SPEND', 'REFUND') AND "orderId" IS NOT NULL)
        OR ("kind" IN ('TOPUP', 'BONUS') AND "topupId" IS NOT NULL)
        OR "kind" = 'ADJUST'
    )
);

CREATE INDEX IF NOT EXISTS "WalletTopup_userId_createdAt_idx" ON "WalletTopup"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "WalletTopup_status_idx" ON "WalletTopup"("status");

CREATE INDEX IF NOT EXISTS "WalletEntry_userId_createdAt_idx" ON "WalletEntry"("userId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "WalletEntry_topupId_kind_key" ON "WalletEntry"("topupId", "kind");

CREATE UNIQUE INDEX IF NOT EXISTS "WalletEntry_orderId_kind_key" ON "WalletEntry"("orderId", "kind");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletTopup_userId_fkey') THEN
    ALTER TABLE "WalletTopup" ADD CONSTRAINT "WalletTopup_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletEntry_userId_fkey') THEN
    ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletEntry_orderId_fkey') THEN
    ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_orderId_fkey"
      FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WalletEntry_topupId_fkey') THEN
    ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_topupId_fkey"
      FOREIGN KEY ("topupId") REFERENCES "WalletTopup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "WalletTopup" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "WalletEntry" ENABLE ROW LEVEL SECURITY;
