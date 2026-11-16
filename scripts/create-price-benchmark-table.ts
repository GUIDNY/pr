// Creates the PriceBenchmark table (see the model in prisma/schema.prisma).
//
// Same pattern as create-game-profile-table.ts: this project has no
// prisma/migrations folder, `prisma db push` hangs against the pooler, so the
// DDL is applied directly and written down here. IF NOT EXISTS so a second
// run is harmless, and ROW LEVEL SECURITY on with no policies so Supabase's
// public REST API cannot read or write it (Prisma connects as the owner and
// is unaffected).
//
// A new table only. No existing table is altered. Run it BEFORE the code that
// reads it reaches production: until the table exists the Merchant feed would
// answer 500.
//
//   npm run db:price-benchmark              # prints the SQL, changes nothing
//   npm run db:price-benchmark -- --apply
import "dotenv/config";
import { db } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

export const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "PriceBenchmark" (
    "sku" TEXT NOT NULL,
    "benchmarkPrice" DOUBLE PRECISION NOT NULL,
    "ourPrice" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'merchant-center',
    CONSTRAINT "PriceBenchmark_pkey" PRIMARY KEY ("sku", "source")
)`,
  `ALTER TABLE "PriceBenchmark" ENABLE ROW LEVEL SECURITY`,
  /* 16 November: the key became (sku, source) so a zap.co.il reading can sit
     beside Merchant Center's. Idempotent for a table created either way. */
  `ALTER TABLE "PriceBenchmark" DROP CONSTRAINT IF EXISTS "PriceBenchmark_pkey"`,
  `ALTER TABLE "PriceBenchmark" ADD CONSTRAINT "PriceBenchmark_pkey" PRIMARY KEY ("sku", "source")`,
];

async function main() {
  for (const sql of STATEMENTS) console.log(`${sql};\n`);
  if (!APPLY) {
    console.log("Dry run. Pass --apply to run the statements above.");
    return;
  }
  for (const sql of STATEMENTS) await db.$executeRawUnsafe(sql);
  const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "PriceBenchmark"`);
  console.log(`Applied. PriceBenchmark exists and holds ${count} row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
