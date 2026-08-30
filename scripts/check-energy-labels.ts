// Finds product images that are EU energy labels rather than photographs of
// the product, across the whole catalog.
//
// Two passes, in order of confidence:
//
//   1. the URL, which is free and needs no network — an energy label is
//      almost always named for what it is (see import-guards.ts);
//   2. the pixel shape — tall and narrow and small — which needs the image
//      itself, so this pass fetches the first few KB of each file and reads
//      the dimensions out of the header. It is a *screening* rule: a real
//      420x1250 appliance shot matches it too, which is why this script
//      prints a list to look at and never deletes anything.
//
// Sorted so the most label-shaped come first: EU label artwork is close to
// 1:2, and the further past that a file is, the more likely it is a genuine
// photo of something tall.
//
//   npx tsx scripts/check-energy-labels.ts            # URL pass only
//   npx tsx scripts/check-energy-labels.ts --measure  # + fetch and measure
//
// Needs DATABASE_URL. --measure additionally needs to be able to reach the
// image hosts, which a cloud container often cannot (see CLAUDE.md) — hosts
// that refuse are reported as unreachable rather than counted either way.
import "dotenv/config";
import { writeFileSync } from "fs";
import { db } from "../src/lib/db";
import { hasEnergyLabelShape, looksLikeEnergyLabelUrl } from "../src/lib/inventory/import-guards";

const MEASURE = process.argv.includes("--measure");
const FETCH_BYTES = 32 * 1024;
const CONCURRENCY = 8;

type Row = {
  productId: string;
  sku: string;
  title: string;
  category: string;
  imageId: string;
  url: string;
  isPrimary: boolean;
};

// Enough of PNG/JPEG/GIF/WebP to get width and height out of a header. Not
// a general decoder: anything it does not recognise returns null and is
// reported as unmeasured rather than guessed at.
function readDimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length < 24) return null;
  // PNG: IHDR is always the first chunk, width/height at bytes 16..24.
  if (buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  // GIF87a/GIF89a: little-endian width/height at bytes 6..10.
  if (buf.toString("ascii", 0, 3) === "GIF") {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }
  // WebP (VP8/VP8L/VP8X) — only the simple lossy and extended forms.
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const kind = buf.toString("ascii", 12, 16);
    if (kind === "VP8X" && buf.length >= 30) {
      return { width: buf.readUIntLE(24, 3) + 1, height: buf.readUIntLE(27, 3) + 1 };
    }
    if (kind === "VP8 " && buf.length >= 30) {
      return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
    // VP8L (lossless): a signature byte, then width-1 and height-1 packed
    // as two 14-bit fields in the next little-endian word.
    if (kind === "VP8L" && buf.length >= 25 && buf[20] === 0x2f) {
      const bits = buf.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  // JPEG: walk the segment markers to the SOFn that carries the size.
  if (buf.readUInt16BE(0) === 0xffd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      // SOF0..SOF15, minus the four markers in that range that are not SOF.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc, 0xd8].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

async function measure(url: string): Promise<{ width: number; height: number } | "unreachable" | "unreadable"> {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${FETCH_BYTES - 1}`, "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok && res.status !== 206) return "unreachable";
    const dims = readDimensions(Buffer.from(await res.arrayBuffer()));
    return dims ?? "unreadable";
  } catch {
    return "unreachable";
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function main() {
  const images = await db.productImage.findMany({
    orderBy: [{ productId: "asc" }, { sortOrder: "asc" }],
    select: {
      id: true,
      url: true,
      sortOrder: true,
      product: {
        select: { id: true, sku: true, title: true, isPublished: true, stockQty: true, category: { select: { name: true } } },
      },
    },
  });

  const rows: Row[] = images.map((img) => ({
    productId: img.product.id,
    sku: img.product.sku,
    title: img.product.title,
    category: img.product.category?.name ?? "",
    imageId: img.id,
    url: img.url,
    isPrimary: img.sortOrder === 0,
  }));

  const byUrl = rows.filter((r) => looksLikeEnergyLabelUrl(r.url));
  console.log(`images in the catalog          ${rows.length}`);
  console.log(`  named like an energy label   ${byUrl.length}`);
  for (const r of byUrl.slice(0, 20)) {
    console.log(`    ${r.sku.padEnd(10)} ${r.isPrimary ? "MAIN " : "     "} ${r.title.slice(0, 40).padEnd(41)} ${r.url.slice(0, 80)}`);
  }

  let shaped: (Row & { width: number; height: number; ratio: number })[] = [];
  let unreachable = 0;
  let unreadable = 0;

  if (MEASURE) {
    const flaggedIds = new Set(byUrl.map((r) => r.imageId));
    const toMeasure = rows.filter((r) => !flaggedIds.has(r.imageId));
    console.log(`\nmeasuring ${toMeasure.length} images (${CONCURRENCY} at a time)…`);
    const results = await mapLimit(toMeasure, CONCURRENCY, (r) => measure(r.url));
    results.forEach((res, i) => {
      if (res === "unreachable") unreachable++;
      else if (res === "unreadable") unreadable++;
      else if (hasEnergyLabelShape(res.width, res.height)) {
        shaped.push({ ...toMeasure[i], ...res, ratio: res.height / res.width });
      }
    });
    // Closest to the 1:2 the EU artwork actually uses, first.
    shaped = shaped.sort((a, b) => Math.abs(a.ratio - 2) - Math.abs(b.ratio - 2));

    console.log(`  label-shaped                 ${shaped.length}`);
    console.log(`  host would not serve them    ${unreachable}`);
    console.log(`  format not recognised        ${unreadable}`);
    for (const r of shaped.slice(0, 30)) {
      console.log(
        `    ${r.sku.padEnd(10)} ${r.isPrimary ? "MAIN " : "     "} ${String(r.width)}x${String(r.height)} ` +
          `(${r.ratio.toFixed(2)}:1)  ${r.title.slice(0, 34).padEnd(35)} ${r.url.slice(0, 70)}`,
      );
    }
  } else {
    console.log("\n(shape pass skipped — re-run with --measure to fetch and measure every image)");
  }

  const all = [
    ...byUrl.map((r) => ({ ...r, why: "filename", size: "" })),
    ...shaped.map((r) => ({ ...r, why: "shape", size: `${r.width}x${r.height}` })),
  ];
  if (all.length > 0) {
    const path = "energy-label-candidates.csv";
    writeFileSync(
      path,
      ["sku,title,category,isPrimary,why,size,imageId,url"]
        .concat(
          all.map((r) =>
            [r.sku, r.title, r.category, r.isPrimary, r.why, r.size, r.imageId, r.url]
              .map((v) => `"${String(v).replace(/"/g, '""')}"`)
              .join(","),
          ),
        )
        .join("\n"),
      "utf8",
    );
    console.log(`\n${all.length} candidates written to ${path}`);
    console.log("Review before removing anything — the shape rule catches genuinely tall product photos too.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
