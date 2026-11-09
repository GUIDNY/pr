/**
 * npm run check:referral
 *
 * חבר מביא חבר, as the owner set it on 9 November: 20 / 50 / 100 ₪ for the
 * first / second / third friend, only once the friend's order reaches
 * 400 ₪; the friend gets 5%. And the spam law's refusal link: it names the
 * address it was sent to and nothing else can be made to look like it.
 */
import { REFERRAL_FRIEND_PERCENT, qualifiesForReferral, referralRewardFor } from "../src/lib/referral-rules";
import { unsubscribeUrl, verifyUnsubscribe } from "../src/lib/marketing-consent";

let failed = 0;
const is = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
  if (!ok) failed++;
};

is("first friend: 20 ₪", referralRewardFor(1), 20);
is("second friend: 50 ₪", referralRewardFor(2), 50);
is("third friend: 100 ₪", referralRewardFor(3), 100);
is("fourth and on: stays 100 ₪", referralRewardFor(7), 100);
is("no friend, no gift", referralRewardFor(0), 0);
is("399 ₪ does not qualify", qualifiesForReferral(399), false);
is("400 ₪ qualifies", qualifiesForReferral(400), true);
is("the friend gets 5%", REFERRAL_FRIEND_PERCENT, 5);

const url = new URL(unsubscribeUrl("Dana@Example.com"));
const e = url.searchParams.get("e") ?? undefined;
const t = url.searchParams.get("t") ?? undefined;
is("the refusal link names its own address", verifyUnsubscribe(e, t), "dana@example.com");
is("a forged signature is refused", verifyUnsubscribe(e, "x".repeat(32)), null);
const other = Buffer.from("someone.else@example.com").toString("base64url");
is("another address with this signature is refused", verifyUnsubscribe(other, t), null);
is("an empty link is refused", verifyUnsubscribe(undefined, undefined), null);

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log("\nall passed");
