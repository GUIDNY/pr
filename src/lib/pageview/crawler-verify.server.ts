import { db } from "@/lib/db";
import {
  CRAWLER_RANGE_SOURCES,
  VERIFIABLE_CRAWLERS,
  classifyCrawlerIp,
  parseRangeDocument,
} from "./crawler-ranges";

/**
 * Fetch the vendors' published lists, then settle the rows waiting on them.
 *
 * Runs on its own cron rather than inside the proxy, for the reason the
 * proxy exists the way it does: the hot path is one `fetch` under
 * `waitUntil` and nothing else, and asking Google for a 21 KB file before
 * answering a page would be a worse bargain than not knowing. Verification
 * is a question about yesterday and can be answered on yesterday's
 * schedule.
 *
 * It is also the direction that survives a vendor renumbering. A row keeps
 * its address, so a hit this run cannot place is re-askable next run —
 * which is why `verified` is left alone rather than written `false` when
 * a list could not be read.
 */

/** Vendor → every prefix any of its files listed this run. */
export type CrawlerRanges = Map<string, string[]>;

export type LoadReport = {
  ranges: CrawlerRanges;
  /** Vendors whose files all answered, and are therefore safe to judge on. */
  loaded: string[];
  /** url → why not. A vendor with one of these is skipped, not disbelieved. */
  failures: { url: string; reason: string }[];
};

/**
 * Read every source.
 *
 * A vendor is only usable when **every** one of its files was read: Google
 * splits its addresses over three, and judging Googlebot against two of
 * them would mark the third file's crawlers as forgeries. One 500 at
 * Google is not evidence about anybody.
 */
export async function loadCrawlerRanges(timeoutMs = 10_000): Promise<LoadReport> {
  const collected = new Map<string, string[]>();
  const broken = new Set<string>();
  const failures: { url: string; reason: string }[] = [];

  await Promise.all(
    CRAWLER_RANGE_SOURCES.map(async (source) => {
      try {
        const response = await fetch(source.url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: "application/json" },
          cache: "no-store",
        });
        if (!response.ok) {
          broken.add(source.vendor);
          failures.push({ url: source.url, reason: `HTTP ${response.status}` });
          return;
        }
        const prefixes = parseRangeDocument(source.shape, await response.json());
        if (prefixes.length === 0) {
          /* A file that parsed to nothing is a file we did not understand —
             a login page, a rename, a shape change. Treated as a failure,
             because an empty list would otherwise mean "nothing is real". */
          broken.add(source.vendor);
          failures.push({ url: source.url, reason: "no prefixes parsed" });
          return;
        }
        const existing = collected.get(source.vendor);
        if (existing) existing.push(...prefixes);
        else collected.set(source.vendor, prefixes);
      } catch (error) {
        broken.add(source.vendor);
        failures.push({ url: source.url, reason: error instanceof Error ? error.message : "fetch failed" });
      }
    }),
  );

  const ranges: CrawlerRanges = new Map();
  for (const [vendor, prefixes] of collected) if (!broken.has(vendor)) ranges.set(vendor, prefixes);
  return { ranges, loaded: [...ranges.keys()], failures };
}

export type VerifyReport = {
  /** Rows looked at. */
  considered: number;
  verified: number;
  rejected: number;
  /** Decided nothing: no address to read, or the vendor was not available. */
  skipped: number;
  loaded: string[];
  failures: { url: string; reason: string }[];
  /** bot → how many of its rows were rejected this run. The report that matters. */
  rejectedByBot: Record<string, number>;
};

/**
 * Settle every row that can be settled.
 *
 * Pending is `verified IS NULL` **and** a crawler some vendor publishes a
 * list for. There is no "checked, nothing to ask" marker and deliberately
 * no column for one: whether a crawler is answerable is a static fact in
 * `CRAWLER_VENDORS`, so a row for Amazonbot is simply never selected, and
 * the day a vendor starts publishing, its old rows become pending again by
 * themselves. A flag would have frozen them as unanswerable instead.
 *
 * Batched because the table grows with somebody else's appetite rather
 * than the shop's traffic — Search Console counted 30,645 Google requests
 * in 90 days — and a cron that tries to settle a quarter of that in one
 * statement is a cron that times out every night at the same point.
 */
export async function verifyPendingCrawlerHits(limit = 5_000): Promise<VerifyReport> {
  const { ranges, loaded, failures } = await loadCrawlerRanges();

  const pending = await db.crawlerHit.findMany({
    where: { verified: null, bot: { in: [...VERIFIABLE_CRAWLERS] } },
    select: { id: true, bot: true, ip: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  const good: string[] = [];
  const bad: string[] = [];
  const rejectedByBot: Record<string, number> = {};
  for (const hit of pending) {
    const verdict = classifyCrawlerIp(hit.bot, hit.ip, ranges);
    if (verdict === true) good.push(hit.id);
    else if (verdict === false) {
      bad.push(hit.id);
      rejectedByBot[hit.bot] = (rejectedByBot[hit.bot] ?? 0) + 1;
    }
  }

  /* Two statements, not one per row. */
  if (good.length) {
    await db.crawlerHit.updateMany({ where: { id: { in: good } }, data: { verified: true } });
  }
  if (bad.length) {
    await db.crawlerHit.updateMany({ where: { id: { in: bad } }, data: { verified: false } });
  }

  return {
    considered: pending.length,
    verified: good.length,
    rejected: bad.length,
    skipped: pending.length - good.length - bad.length,
    loaded,
    failures,
    rejectedByBot,
  };
}
