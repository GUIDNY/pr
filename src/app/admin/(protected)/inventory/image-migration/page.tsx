import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import { countImagesToMigrate } from "@/lib/inventory/image-migration";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { ImageMigrationPanel } from "@/components/admin/image-migration-panel";

export const metadata = { title: "העברת תמונות | Buy Today Admin" };

export default async function ImageMigrationPage() {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) redirect("/admin/inventory");

  const [prec, everything] = await Promise.all([
    countImagesToMigrate(["prec.co.il"]),
    countImagesToMigrate(),
  ]);

  return (
    <div>
      <InventoryTabs owner />
      <ImageMigrationPanel
        groups={[
          {
            key: "prec",
            label: "האתר הישן — prec.co.il",
            /* First, and separately from the rest, because this one is not
               only an SEO job. It is the single largest host in the
               catalogue and it holds the only photograph of most of those
               products: the day that site is switched off they leave the
               shop, since a product with no picture is not shown at all. */
            hosts: ["prec.co.il"],
            note: `${prec} תמונות. האתר הישן של החברה — אם הוא ייסגר, המוצרים האלה נעלמים מהחנות.`,
          },
          {
            key: "all",
            label: "כל השאר",
            note: `${everything} תמונות חיצוניות בסך הכל, מ-176 מארחים. מארחים חסומים לא נכללים.`,
          },
        ]}
      />
    </div>
  );
}
