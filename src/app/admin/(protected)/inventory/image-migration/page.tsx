import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import { countImagesToMigrate, HOSTS_THAT_REFUSE_US } from "@/lib/inventory/image-migration";
import { InventoryTabs } from "@/components/admin/inventory-tabs";
import { ImageMigrationPanel } from "@/components/admin/image-migration-panel";

export const metadata = { title: "העברת תמונות | Buy Today Admin" };

/* The batch action is invoked from this segment, so this is what caps it.
   Sixty is the Hobby ceiling and comfortably inside Pro's; the default
   would kill a batch that hits one slow host plus a retry. */
export const maxDuration = 60;

export default async function ImageMigrationPage() {
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) redirect("/admin/inventory");

  const [prec, everything] = await Promise.all([
    countImagesToMigrate(["prec.co.il"]),
    countImagesToMigrate(undefined, HOSTS_THAT_REFUSE_US),
  ]);

  return (
    <div>
      <InventoryTabs />
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
            note: `${everything} תמונות חיצוניות. מארחים חסומים לא נכללים, וגם לא prec.co.il — הוא מסרב לבקשות שלנו.`,
          },
        ]}
      />
    </div>
  );
}
