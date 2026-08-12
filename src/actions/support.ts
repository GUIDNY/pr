"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { SUPPORT_CHANNELS } from "@/lib/enums";

const schema = z.object({
  name: z.string().min(2, "יש להזין שם"),
  phone: z.string().min(9, "יש להזין מספר טלפון תקין"),
  channel: z.enum(SUPPORT_CHANNELS),
  topic: z.string().optional(),
  message: z.string().optional(),
});

export async function submitSupportRequestAction(input: {
  name: string;
  phone: string;
  channel: string;
  topic?: string;
  message?: string;
}) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "שגיאה בטופס" };
  }
  await db.supportRequest.create({ data: parsed.data });
  return { success: true, error: null };
}
