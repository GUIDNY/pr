import "server-only";
import { createClient } from "@supabase/supabase-js";

// Media a customer sent the bot — a photo of the rating plate, a voice note
// describing the noise the fridge makes — kept where staff can actually open
// it.
//
// Why it is stored rather than linked: WhatsApp Cloud API does not hand out
// a durable URL. Meta's link expires within minutes and needs a bearer token
// even while it lives, so a stored URL is a dead link by the time anyone
// opens the complaint. The bot sends the bytes instead, and they land in a
// private bucket that is only ever read through a short-lived signed URL.
//
// A separate bucket from product-images, which is public by design: this one
// holds customers' own photos and must never be directly fetchable.
const BUCKET = "complaint-media";

// 10MB of base64 is ~13.4MB of text, and the whole request body has to be
// held in memory to parse it. The cap is on the decoded bytes, checked
// before the decode is trusted.
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/amr": "amr",
  "video/mp4": "mp4",
  "application/pdf": "pdf",
};

function client() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export function isMediaStorageConfigured() {
  return client() !== null;
}

export type MediaUpload =
  | { ok: true; path: string }
  | { ok: false; reason: "too-large" | "not-configured" | "upload-failed" | "empty" };

export async function storeComplaintMedia(
  complaintId: string,
  base64: string,
  mime: string | null,
): Promise<MediaUpload> {
  const payload = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  if (!payload.trim()) return { ok: false, reason: "empty" };

  // Checked from the encoded length before decoding, so an oversized body
  // never becomes an oversized Buffer.
  const approximateBytes = Math.floor((payload.length * 3) / 4);
  if (approximateBytes > MAX_MEDIA_BYTES) return { ok: false, reason: "too-large" };

  const supabase = client();
  if (!supabase) return { ok: false, reason: "not-configured" };

  let bytes: Buffer;
  try {
    bytes = Buffer.from(payload, "base64");
  } catch {
    return { ok: false, reason: "empty" };
  }
  if (bytes.length === 0) return { ok: false, reason: "empty" };
  if (bytes.length > MAX_MEDIA_BYTES) return { ok: false, reason: "too-large" };

  const contentType = mime && EXTENSIONS[mime] ? mime : "application/octet-stream";
  const extension = (mime && EXTENSIONS[mime]) || "bin";
  const path = `${complaintId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;

  // The bucket is created on first use and always private — passing
  // `public: false` explicitly rather than relying on the default, because
  // the default is the one thing here that must never drift.
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    await supabase.storage.createBucket(BUCKET, { public: false });
  }

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) return { ok: false, reason: "upload-failed" };
  return { ok: true, path };
}

// Signed for ten minutes: long enough to open the photo and look at it,
// short enough that a URL pasted into a chat is useless by the time anyone
// else clicks it.
const SIGNED_URL_TTL_SECONDS = 600;

export async function signedComplaintMediaUrl(path: string): Promise<string | null> {
  const supabase = client();
  if (!supabase) return null;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) return null;
  return data.signedUrl;
}
