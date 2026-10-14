/**
 * The list of places a parcel can be addressed to, from the state's own
 * register, and which of them the fast delivery promise covers.
 *
 * The checkout's city field used to be free text — "נתניה", "נתניה ", "נתנייה"
 * and "Netanya" were four different cities to anything reading orders, and
 * the carrier got whichever one the shopper typed. This writes
 * src/lib/data/localities.json from the Central Bureau of Statistics
 * localities table published on data.gov.il, so the field can complete
 * what the shopper starts typing, and so the checkout can say how long
 * delivery takes to the place they chose.
 *
 * THE LOCAL ZONE. The owner's policy (14 October 2026): an address between
 * Herzliya and Zichron Yaakov is reached inside three business days, the
 * rest of the country in three to seven. The register has no "coastal
 * strip", so the nearest official shape is used: the Sharon sub-district
 * (נפה 41 — Netanya, Kfar Yona, Even Yehuda, Emek Hefer…), the Hadera
 * sub-district (נפה 32 — Hadera, Pardes Hanna, Binyamina, Zichron, Or
 * Akiva, Caesarea…), and the four Sharon cities the register files under
 * Petah Tikva: Herzliya, Ra'anana, Kfar Saba and Hod Hasharon. Widening or
 * narrowing it is a change to LOCAL_SUBDISTRICTS / LOCAL_EXTRA below and a
 * re-run; nothing else in the code knows the rule.
 *
 *   npx tsx scripts/update-localities.ts
 *
 * Network: data.gov.il. Reachable from the cloud containers as of 14 October.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const RESOURCE = "5c78e9fa-c2e2-4771-93ff-7f400a12f7ba";
const URL = `https://data.gov.il/api/3/action/datastore_search?resource_id=${RESOURCE}&limit=5000`;

const LOCAL_SUBDISTRICTS = new Set([41, 32]);
const LOCAL_EXTRA = new Set(["הרצליה", "רעננה", "כפר סבא", "הוד השרון"]);

type Row = { "שם_ישוב": string; "סמל_נפה": number; "שם_נפה": string };

/** The register's spacing is uneven ("תל אביב - יפו", trailing blanks). */
const clean = (s: string) => s.replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").trim();

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`data.gov.il answered ${res.status}`);
  const json = (await res.json()) as { success: boolean; result: { records: Row[]; total: number } };
  if (!json.success) throw new Error("data.gov.il: success=false");
  const rows = json.result.records;
  if (rows.length < 1000) throw new Error(`only ${rows.length} rows — refusing to write a short list`);

  const names = new Set<string>();
  const local = new Set<string>();
  for (const r of rows) {
    const name = clean(r["שם_ישוב"]);
    if (!name) continue;
    names.add(name);
    if (LOCAL_SUBDISTRICTS.has(Number(r["סמל_נפה"])) || LOCAL_EXTRA.has(name)) local.add(name);
  }
  for (const extra of LOCAL_EXTRA) if (!names.has(extra)) throw new Error(`${extra} is not in the register under that spelling`);

  const collator = new Intl.Collator("he");
  const out = {
    source: `https://data.gov.il/dataset/citiesandsettelments (resource ${RESOURCE})`,
    fetchedAt: new Date().toISOString().slice(0, 10),
    names: [...names].sort(collator.compare),
    local: [...local].sort(collator.compare),
  };
  const path = join(process.cwd(), "src/lib/data/localities.json");
  writeFileSync(path, JSON.stringify(out, null, 0) + "\n");
  console.log(`${out.names.length} localities, ${out.local.length} in the local zone → ${path}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
