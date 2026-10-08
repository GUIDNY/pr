// Creates WalletTopup and WalletEntry — the BuyToday balance (lib/wallet.ts).
//
// The SQL lives in docs/wallet-ddl.sql so it can also be pasted into the
// Supabase SQL editor; this runs the same file through the site's own client,
// the way every other schema change here is applied (`prisma db push` hangs
// against the pooler). Dry run by default.
//
//   npm run db:wallet              # prints the SQL, changes nothing
//   npm run db:wallet -- --apply
//
// Run it BEFORE WALLET_ENABLED is turned on. With the flag off nothing reads
// these tables; with it on and the tables missing, the wallet page and the
// checkout's balance check answer 500.
import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { db } from "../src/lib/db";

const APPLY = process.argv.includes("--apply");

/* One statement per chunk: the driver prepares each call, and a prepared
   statement cannot hold two commands. The file separates them with a blank
   line after the semicolon, which a DO $$ … $$ body never contains. */
function statements(): string[] {
  const raw = readFileSync(join(__dirname, "..", "docs", "wallet-ddl.sql"), "utf8");
  return raw
    .split(/;\s*\n\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n")
        .trim()
        .replace(/;$/, ""),
    )
    .filter(Boolean);
}

async function main() {
  const list = statements();
  for (const sql of list) console.log(`${sql};\n`);
  if (!APPLY) {
    console.log(`Dry run (${list.length} statements). Pass --apply to run them.`);
    return;
  }
  for (const sql of list) await db.$executeRawUnsafe(sql);
  const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(`SELECT count(*) FROM "WalletEntry"`);
  console.log(`Applied. WalletEntry exists and holds ${count} row(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
