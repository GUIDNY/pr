import "server-only";
import { createClient } from "@supabase/supabase-js";

// Separate bucket from inventory-source (which holds private supplier price
// sheets) — product photos need to be directly, publicly fetchable by
// next/image and by any visitor's browser, not downloaded server-side
// through an authenticated client.
const BUCKET = "product-images";

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isProductImageStorageConfigured() {
  return client() !== null;
}

async function ensureBucket(supabase: NonNullable<ReturnType<typeof client>>) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: true });
  }
}

export async function uploadProductImage(path: string, bytes: Buffer, contentType: string): Promise<string> {
  const supabase = client();
  if (!supabase) throw new Error("Supabase Storage is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing)");
  await ensureBucket(supabase);
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
