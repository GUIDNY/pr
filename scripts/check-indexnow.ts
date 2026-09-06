// Guards the one thing about IndexNow that fails silently.
//
// Bing verifies a submission by fetching /<key>.txt from the domain and
// checking it contains exactly the key that was submitted. If the file and
// the key in the code ever disagree — a rotated key, a stray newline, a BOM
// from an editor — every submission is rejected with a 403 and nothing else
// in the system says a word: the sync still succeeds, the admin save still
// saves, and the shop simply stops being announced.
//
// Run: npx tsx scripts/check-indexnow.ts
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { INDEXNOW_KEY } from "../src/lib/indexnow";

const path = join(process.cwd(), "public", `${INDEXNOW_KEY}.txt`);
const failures: string[] = [];

if (!existsSync(path)) {
  failures.push(`public/${INDEXNOW_KEY}.txt does not exist — every submission will 403`);
} else {
  const bytes = readFileSync(path);
  const text = bytes.toString("utf8");

  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    failures.push("the key file starts with a UTF-8 BOM; Bing compares bytes and will reject it");
  }
  if (text !== INDEXNOW_KEY) {
    failures.push(
      `the key file does not contain exactly the key.\n` +
        `      file: ${JSON.stringify(text)}\n` +
        `      code: ${JSON.stringify(INDEXNOW_KEY)}`,
    );
  }
  if (!/^[0-9a-zA-Z-]{8,128}$/.test(INDEXNOW_KEY)) {
    failures.push(`the key itself is not a shape IndexNow accepts: ${JSON.stringify(INDEXNOW_KEY)}`);
  }
}

if (failures.length > 0) {
  console.error("IndexNow key check FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}

console.log(`ok    public/${INDEXNOW_KEY}.txt matches lib/indexnow.ts exactly (${INDEXNOW_KEY.length} bytes, no BOM, no trailing newline)`);
