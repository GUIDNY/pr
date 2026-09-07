/**
 * Does this slug end in the hash the importer appends when it has nothing
 * readable to name a row with?
 *
 * Both generators — the inventory sync and the integrations endpoint — finish
 * a slug with 6-8 hex characters of a sha1 (see lib/slug-base.ts), so a
 * trailing "-3d59b03762" is the tell that a person never chose this address.
 *
 * It exists because the first version of this test asked whether the *whole*
 * slug was hex, which found 69 brands and missed 39 more: "sauter-3d59b0"
 * reads like a real name and is still an address nobody picked. Counting the
 * suffix instead gives 108 of 147, which is the real number.
 */
export function hasDerivedHashSuffix(slug: string): boolean {
  return /-[0-9a-f]{6,8}$/.test(slug);
}
