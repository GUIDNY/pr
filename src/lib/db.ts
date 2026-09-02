import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Vercel deploys every route as its own serverless function and keeps
// instances warm between requests, holding their pg connections open the
// whole time by default. Connections from every warm instance across every
// route pile up over the deployment's lifetime and never get released —
// that's what exhausts this database's (low) connection budget over time,
// not a single burst. `max` bounds each instance's pool; `idleTimeoutMillis`
// is the actual fix — it makes each connection close itself after a few
// seconds of inactivity so it's handed back to the database instead of
// held forever by an idle-but-warm function. Caching the client on
// globalThis in every environment (not just dev) means a warm instance
// reuses its pool across requests instead of opening a new one per call.
// The binding limit is not Postgres's. It is Supavisor's, the pooler in front
// of it, which caps *client* connections at 200 — and on 2026-09-02 the live
// site spent a stretch answering half its requests with a 500 because of it,
// while Postgres itself sat at twenty-odd connections and was never the
// problem. Every warm instance holding three of those 200 means seventy
// instances is the whole budget, which a deploy's cold-start burst reaches on
// its own. One connection per instance is the standard shape for serverless in
// front of a transaction pooler: the pooler is the thing doing the pooling, and
// a second connection here buys nothing but a share of somebody else's.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 1,
  idleTimeoutMillis: 8_000,
  connectionTimeoutMillis: 10_000,
});

function createClient() {
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Connection bursts (a cold-start pile-up, a crawler hitting many routes
  // at once, build-time page collection) can transiently exhaust the
  // connection budget even with a capped pool. Rather than let one unlucky
  // moment 500 a whole page, retry a few times with a short backoff.
  //
  // Running out at the pooler and running out at Postgres are different errors,
  // and this used to catch only the second one. So the retry never fired for
  // the failure that actually took the site down — Supavisor's own client
  // limit, which arrives as P2039 carrying `(EMAXCONN) max client connections
  // reached`. Both are the same situation from the caller's side: wait a
  // moment, a connection frees up, the query succeeds. Matched on the message
  // as well as the code, because the code is the part a driver upgrade is free
  // to renumber.
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const maxAttempts = 4;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            const code = err instanceof Error && "code" in err ? (err as { code?: string }).code : undefined;
            const message = err instanceof Error ? err.message : "";
            const outOfConnections =
              code === "P2037" ||
              code === "P2039" ||
              /EMAXCONN|max client connections|too many (clients|connections)/i.test(message);
            if (!outOfConnections || attempt === maxAttempts) throw err;
            // Jittered, so a burst of instances does not retry in lockstep and
            // recreate the same pile-up one beat later.
            await new Promise((resolve) => setTimeout(resolve, 150 * attempt + Math.random() * 150));
          }
        }
        throw new Error("unreachable");
      },
    },
  });
}

export const db = (globalForPrisma.prisma as ReturnType<typeof createClient> | undefined) ?? createClient();

globalForPrisma.prisma = db as unknown as PrismaClient;
