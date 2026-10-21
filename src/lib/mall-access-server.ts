import "server-only";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { mallAllowed } from "@/lib/mall-access";

/** The signed-in account's email when it may see the mall, otherwise null.
    Read from the database, not the session token: a role granted today
    lets the person in today, and one taken away stops working at once. */
export async function mallViewerEmail(): Promise<string | null> {
  const session = await getSession();
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { email: true, role: true },
  });
  return user && mallAllowed(user) ? user.email : null;
}
