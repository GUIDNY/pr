/**
 * The build has to generate the Prisma client, and this is why.
 *
 * `prisma generate` lived only in `postinstall`. Vercel restores
 * node_modules from its build cache when package.json has not changed, and
 * a restored install does not run postinstall — so the generated client in
 * a deploy is the one from whichever build last really installed. The
 * client is gitignored, so nothing in the repo contradicts it.
 *
 * What that does is silent. A column added to the schema and to the
 * database is simply absent from the client, Prisma 7 drops the unknown key
 * out of `data` rather than refusing it, the update succeeds, and the value
 * is never written. No error, no alert, no failed row.
 *
 * It cost an afternoon on 11 October. lastMatchPath and lastRowModel were
 * added to settle a question about the matcher; the sync ran 3,601 rows
 * against the deploy that contained them and wrote neither, with 45 alerts
 * that were all ordinary data-quality findings. Meanwhile pricesAdopted —
 * added two builds earlier, when an install had really happened — was
 * written on the same run. That is the signature: new fields work until
 * they do not, and which ones work depends on an install nobody can see.
 *
 * The reverse direction is worse than a missing write. adoptPrice in
 * sync.ts reads existing.priceManualAt to decide whether a person has
 * priced a product. A client that does not know the column returns
 * undefined for it, `undefined === null` is false, and the sync would stop
 * adopting prices entirely — or, with the condition written the other way
 * round, overwrite every price a person had set.
 *
 * So the check is on the build script, not on a symptom.
 */
import { readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dirname, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  scripts?: Record<string, string>;
};

let failed = 0;
const check = (ok: boolean, what: string) => {
  if (!ok) {
    console.error(`FAIL  ${what}`);
    failed++;
  }
};

const build = pkg.scripts?.build ?? "";
check(build.length > 0, "package.json has a build script");
check(
  /(^|&&|;)\s*(npx\s+)?prisma\s+generate\b/.test(build),
  `the build script runs "prisma generate" before building — got: ${build}`,
);
check(
  /next\s+build/.test(build),
  `the build script still runs "next build" — got: ${build}`,
);
check(
  build.indexOf("prisma generate") < build.indexOf("next build"),
  "prisma generate comes before next build, or the client is stale for this build",
);

/* postinstall may keep it too — that is what makes a local checkout work
   without a build — but it must not be the only place. */
check(
  (pkg.scripts?.postinstall ?? "").includes("prisma generate"),
  "postinstall still generates the client for local installs",
);

console.log(
  failed === 0
    ? `  ✓ the build generates the Prisma client: ${build}`
    : `  ${failed} check(s) failed`,
);
process.exitCode = failed > 0 ? 1 : 0;
