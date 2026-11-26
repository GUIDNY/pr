-- Cashback v2: CashbackAccount + CashbackLedger (see CASHBACK-V2.md).
--
-- NOT APPLIED ANYWHERE. This project has no migrate step on deploy and
-- `prisma db push` hangs against the pooler (CLAUDE.md), so somebody has to
-- run this by hand — the same way scripts/create-game-profile-table.ts was
-- run — BEFORE CASHBACK_V2_ENABLED is switched on. With the flag off no code
-- path reads or writes these tables, so merging without applying is safe.
--
-- The statements are what
--   prisma migrate diff --from-schema <origin/main schema> --to-schema prisma/schema.prisma --script
-- printed on 2026-11-26, plus two things it cannot know, as in the other
-- table scripts of this repo: IF NOT EXISTS / guarded constraints so a second
-- run is harmless, and ROW LEVEL SECURITY with no policies so Supabase's REST
-- API cannot reach the tables (Prisma connects as the owner and is unaffected).
-- Purely additive: no existing table or column is touched.

CREATE TABLE IF NOT EXISTS "CashbackAccount" (
    "userId" TEXT NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackAccount_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE IF NOT EXISTS "CashbackLedger" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "orderId" TEXT,
    "couponCode" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashbackLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CashbackLedger_key_key" ON "CashbackLedger"("key");
CREATE INDEX IF NOT EXISTS "CashbackLedger_userId_idx" ON "CashbackLedger"("userId");
CREATE INDEX IF NOT EXISTS "CashbackLedger_type_createdAt_idx" ON "CashbackLedger"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "CashbackLedger_orderId_idx" ON "CashbackLedger"("orderId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashbackAccount_userId_fkey') THEN
    ALTER TABLE "CashbackAccount" ADD CONSTRAINT "CashbackAccount_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CashbackLedger_userId_fkey') THEN
    ALTER TABLE "CashbackLedger" ADD CONSTRAINT "CashbackLedger_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "CashbackAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CashbackLedger" ENABLE ROW LEVEL SECURITY;
