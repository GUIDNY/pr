import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { isSiteAdmin } from "@/lib/permissions";
import { BANNERS_SECTION_KEY, parseStoredBanners } from "@/lib/banners";
import { BannerManager } from "@/components/admin/banner-manager";

export const metadata = { title: "באנרים - דף הבית | Buy Today Admin" };

export default async function AdminBannersPage() {
  // The layout lets any back-office role in; this page is the owner's.
  const session = await getSession();
  if (!session || !isSiteAdmin(session.role)) redirect("/admin");

  const row = await db.homepageSection.findUnique({ where: { key: BANNERS_SECTION_KEY } });
  let banners = [] as ReturnType<typeof parseStoredBanners>;
  if (row) {
    try {
      banners = parseStoredBanners(JSON.parse(row.payload));
    } catch {
      banners = [];
    }
  }

  return <BannerManager initialBanners={banners} />;
}
