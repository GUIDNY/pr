import "server-only";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site-url";

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
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType,
    upsert: true,
    // Supabase defaults to no-cache. The path carries the image's own id,
    // so the bytes at an address never change and a year is honest.
    cacheControl: "31536000",
  });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  /* Deliberately NOT getPublicUrl(). Supabase answers every public object
     with `X-Robots-Tag: none` — noindex,nofollow — on both the object and
     the render endpoints, with no setting to turn it off. Handing Google
     that header is worse than the hotlink the migration replaced, and on an
     image_link it is a documented Merchant Center disapproval.

     /img/ is this shop's own route over the same bytes, minus that header.
     It also puts the picture on the domain Google Images credits, which is
     the reason for moving them in the first place. See app/img/[...path]. */
  return `${SITE_URL}/img/${BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`;
}
