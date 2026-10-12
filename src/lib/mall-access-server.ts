import "server-only";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { mallAllowedEmail } from "@/lib/mall-access";

/** The signed-in account's email when it may see the mall, otherwise null. */
export async function mallViewerEmail(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { email: true },
  });
  return user && mallAllowedEmail(user.email) ? user.email : null;
}
