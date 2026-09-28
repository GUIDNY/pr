// Creates the GameProfile table — the one piece of schema the 3D mall's
// account link needs (see the GameProfile model in prisma/schema.prisma).
//
// This project has no prisma/migrations folder and no migrate step on deploy.
// `prisma db push` hangs against the pooler, so schema changes are applied as
// direct DDL through the same client the site uses, and this is that DDL
// written down instead of typed from memory. The SQL is what
// `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
// prints for the model, word for word, plus two things it cannot know:
//
//   IF NOT EXISTS / a guarded constraint, so running it twice is harmless.
//   Nobody should have to remember whether it has already run.
//
//   ROW LEVEL SECURITY, enabled with no policies. Supabase publishes every
//   table in `public` through its REST API to anybody holding the anon key,
//   and RLS off means that API can read and write the table. The site never
//   goes that way — Prisma connects as the table's owner, which RLS does not
//   apply to — so this closes a door nobody uses without touching the one
//   that is used. Complaint and ComplaintMessage, the two most recent tables,
//   were created the same way.
//
// Run it BEFORE the code that reads the table reaches production. Nothing a
// shopper sees depends on it — the table is only touched by /api/game/* — but
// until it exists those two routes answer 500.
//
//   npm run db:game-profile              # prints the SQL, changes nothing
//   npm run db:game-profile -- --apply
import "dotenv/config";
import { db } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "GameProfile" (
    "userId" TEXT NOT NULL,
    "profile" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GameProfile_pkey" PRIMARY KEY ("userId")
)`,
  `DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GameProfile_userId_fkey') THEN
    ALTER TABLE "GameProfile" ADD CONSTRAINT "GameProfile_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$`,
  `ALTER TABLE "GameProfile" ENABLE ROW LEVEL SECURITY`,
];

async function main() {
  for (const sql of STATEMENTS) console.log(`${sql};\n`);
  if (!APPLY) {
    console.log("Dry run. Pass --apply to run the statements above.");
    return;
  }
  for (const sql of STATEMENTS) await db.$executeRawUnsafe(sql);
  const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "GameProfile"`);
  console.log(`Applied. GameProfile exists and holds ${count} row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
