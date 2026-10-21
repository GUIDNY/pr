/**
 * Who gets into the private 3D mall, and what a pass proves. No database:
 * the rule is a pure function and the pass is a JWT signed with a key set
 * here for the run.
 *
 *   npm run check:mall
 */
process.env.MALL_GATE_SECRET = "check-mall-access-secret-of-at-least-32-chars";
import { SignJWT } from "jose";
import { mallAllowed, mallAllowedEmail, signMallPass, verifyMallPass } from "../src/lib/mall-access";

let failures = 0;
function is(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`${ok ? "  ok  " : "  FAIL"}  ${name}${ok ? "" : `\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`}`);
}

async function main() {
  console.log("\nwho is allowed");
  is("an ADMIN account", mallAllowed({ email: "x@example.com", role: "ADMIN" }), true);
  is("a STAFF account", mallAllowed({ email: "x@example.com", role: "STAFF" }), true);
  is("a SELLER account", mallAllowed({ email: "x@example.com", role: "SELLER" }), true);
  is("a customer is not", mallAllowed({ email: "x@example.com", role: "CUSTOMER" }), false);
  is("a listed address is, whatever the role", mallAllowed({ email: "BD12123@gmail.com ", role: "CUSTOMER" }), true);
  is("no role, no listing → no", mallAllowed({ email: null, role: null }), false);
  is("the list still answers on its own", mallAllowedEmail("asaf@buytoday.co.il"), true);

  console.log("\nwhat a pass proves");
  const pass = await signMallPass("manager@example.com");
  is("a pass is minted with the key set", typeof pass, "string");
  is("…and verifies, for an address on no list (ok is the authorisation)", await verifyMallPass(pass!), true);
  const key = new TextEncoder().encode(process.env.MALL_GATE_SECRET!);
  const older = await new SignJWT({ email: "bd12123@gmail.com" }).setProtectedHeader({ alg: "HS256" }).setAudience("bt-mall").setIssuedAt().setExpirationTime("1h").sign(key);
  is("an older pass without ok still works for a listed address", await verifyMallPass(older), true);
  const olderStranger = await new SignJWT({ email: "someone@example.com" }).setProtectedHeader({ alg: "HS256" }).setAudience("bt-mall").setIssuedAt().setExpirationTime("1h").sign(key);
  is("…and not for anyone else", await verifyMallPass(olderStranger), false);
  const forged = await new SignJWT({ email: "x@example.com", ok: true }).setProtectedHeader({ alg: "HS256" }).setAudience("bt-mall").setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode("another-key-of-at-least-32-characters-long"));
  is("ok under another key is nothing", await verifyMallPass(forged), false);
  const now = Math.floor(Date.now() / 1000);
  const expired = await new SignJWT({ email: "x@example.com", ok: true }).setProtectedHeader({ alg: "HS256" }).setAudience("bt-mall").setIssuedAt(now - 7200).setExpirationTime(now - 3600).sign(key);
  is("an expired pass is nothing", await verifyMallPass(expired), false);
  const wrongAud = await new SignJWT({ email: "x@example.com", ok: true }).setProtectedHeader({ alg: "HS256" }).setAudience("elsewhere").setIssuedAt().setExpirationTime("1h").sign(key);
  is("a token for another audience is nothing", await verifyMallPass(wrongAud), false);
  is("no token is nothing", await verifyMallPass(undefined), false);

  console.log(failures === 0 ? "\nall good" : `\n${failures} failing`);
  process.exit(failures === 0 ? 0 : 1);
}
main();
