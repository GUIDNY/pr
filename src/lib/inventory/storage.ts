import "server-only";
import { createClient } from "@supabase/supabase-js";

const BUCKET = "inventory-source";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isStorageConfigured() {
  return client() !== null;
}

export async function ensureBucket() {
  const supabase = client();
  if (!supabase) throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }
}

export async function uploadInventoryFile(path: string, bytes: Buffer, contentType: string) {
  const supabase = client();
  if (!supabase) throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  await ensureBucket();
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return path;
}

export async function downloadInventoryFile(path: string): Promise<Buffer> {
  const supabase = client();
  if (!supabase) throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`Storage download failed: ${error?.message ?? "unknown error"}`);
  return Buffer.from(await data.arrayBuffer());
}
