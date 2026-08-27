import "dotenv/config";
import { db } from "../src/lib/db";
import { LEGAL_PAGES } from "./legal-pages-content";

// Upserts the store's legal pages from the content module next door. Safe to
// re-run: it overwrites the body of each slug it knows about and leaves every
// other CmsPage row alone.
async function main() {
  for (const page of LEGAL_PAGES) {
    await db.cmsPage.upsert({
      where: { slug: page.slug },
      create: { slug: page.slug, title: page.title, body: page.body },
      update: { title: page.title, body: page.body },
    });
    console.log(`${page.slug}: ${page.body.length} chars`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
