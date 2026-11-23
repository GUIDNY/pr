// Guards where the prec.co.il fetch token may go. Run:
//   NODE_OPTIONS=--conditions=react-server npx tsx scripts/check-image-fetch-token.ts
import { fetchTokenFor } from "../src/lib/inventory/image-migration";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { console.log(`FAIL  ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`); failed++; }
};

delete process.env.IMAGE_FETCH_TOKEN;
eq("unset: never", fetchTokenFor("https://www.prec.co.il/images/a.jpg"), null);

process.env.IMAGE_FETCH_TOKEN = "  s3cret ";
eq("www.prec.co.il", fetchTokenFor("https://www.prec.co.il/images/a.jpg"), "s3cret");
eq("prec.co.il", fetchTokenFor("https://prec.co.il/images/a.jpg"), "s3cret");
eq("subdomain", fetchTokenFor("https://img.prec.co.il/a.jpg"), "s3cret");
eq("uppercase host", fetchTokenFor("https://WWW.PREC.CO.IL/a.jpg"), "s3cret");
for (const other of [
  "https://prec.co.il.evil.com/a.jpg",
  "https://notprec.co.il/a.jpg",
  "https://evil.com/prec.co.il/a.jpg",
  "https://evil.com/?u=https://www.prec.co.il/a.jpg",
  "https://www.semicom.co.il/a.jpg",
  "https://user@evil.com@prec.co.il.evil.com/a.jpg",
  "not a url",
  "",
]) eq(`never: ${other}`, fetchTokenFor(other), null);

console.log(failed === 0 ? "ALL PASS" : `${failed} FAILED`);
process.exit(failed ? 1 : 0);
