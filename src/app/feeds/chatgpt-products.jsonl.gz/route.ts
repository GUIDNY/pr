import { gzipSync } from "node:zlib";
import { buildChatgptFeed } from "@/lib/feeds/chatgpt-feed-query";

/**
 * The ChatGPT product feed as a gzip-compressed JSONL file, which is the form
 * Business Hub's "hosted URL" accepts (it rejects plain .jsonl with "not in the
 * required gzip-compressed JSONL format"; parquet, .jsonl.gz, .csv.gz and
 * .tsv.gz are what it takes).
 *
 * The body is a real gzip file, the same lines as /feeds/chatgpt-products.jsonl.
 * It is served as application/gzip with NO Content-Encoding on purpose: with
 * Content-Encoding: gzip a client decompresses the response by itself and the
 * importer would be handed plain text again, which is exactly what it refuses.
 *
 * Same rules as the plain feed otherwise: public, nothing private in it, and
 * force-dynamic because DATABASE_URL is Production-only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const feed = await buildChatgptFeed();
  const gz = gzipSync(Buffer.from(feed.body, "utf8"));

  return new Response(new Uint8Array(gz), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Length": String(gz.length),
      "Content-Disposition": 'attachment; filename="chatgpt-products.jsonl.gz"',
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
      "X-Feed-Items": String(feed.included),
      "X-Feed-Skipped-No-Own-Image": String(feed.skippedNoOwnImage),
      "X-Feed-Skipped-Other": String(feed.skippedOther),
    },
  });
}
