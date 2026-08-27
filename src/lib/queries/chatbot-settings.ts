import "server-only";
import { db } from "@/lib/db";

// Always exactly one row, fixed id — created on first read if it doesn't
// exist yet, so callers never have to null-check this.
export async function getChatbotSettings() {
  return db.chatbotSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}
