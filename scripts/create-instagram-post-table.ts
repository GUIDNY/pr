// Creates the InstagramPost table (see the model in prisma/schema.prisma).
// Same convention as create-game-profile-table.ts: no prisma/migrations folder,
// `prisma db push` hangs on the pooler, so this is the DDL written down.
// Idempotent; RLS on with no policies (the site connects as owner).
//
//   npx tsx scripts/create-instagram-post-table.ts            # prints SQL
//   npx tsx scripts/create-instagram-post-table.ts --apply
import "dotenv/config";
import { db } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "InstagramPost" (
    "id" TEXT NOT NULL,
    "scheduledFor" DATE NOT NULL,
    "type" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "caption" TEXT NOT NULL,
    "productSlug" TEXT,
    "expectedPrice" DOUBLE PRECISION,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "rejected" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "igMediaId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InstagramPost_pkey" PRIMARY KEY ("id")
)`,
  `CREATE INDEX IF NOT EXISTS "InstagramPost_scheduledFor_status_idx" ON "InstagramPost"("scheduledFor", "status")`,
  `ALTER TABLE "InstagramPost" ADD COLUMN IF NOT EXISTS "rejected" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "InstagramPost" ENABLE ROW LEVEL SECURITY`,
];

async function main() {
  for (const sql of STATEMENTS) console.log(`${sql};\n`);
  if (!APPLY) return console.log("Dry run. Pass --apply.");
  for (const sql of STATEMENTS) await db.$executeRawUnsafe(sql);
  console.log("Applied.");
}
main().finally(() => db.$disconnect());
