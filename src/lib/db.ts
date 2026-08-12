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
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
  idleTimeoutMillis: 8_000,
  connectionTimeoutMillis: 10_000,
});

function createClient() {
  const client = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

  // Connection bursts (a cold-start pile-up, a crawler hitting many routes
  // at once, build-time page collection) can transiently exceed this
  // database's connection cap even with a capped pool — Postgres error
  // P2037. Rather than let one unlucky moment 500 a whole page, retry a
  // couple of times with a short backoff before giving up.
  return client.$extends({
    query: {
      async $allOperations({ args, query }) {
        const maxAttempts = 3;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            const isConnectionLimitError =
              err instanceof Error &&
              "code" in err &&
              (err as { code?: string }).code === "P2037";
            if (!isConnectionLimitError || attempt === maxAttempts) throw err;
            await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
          }
        }
        throw new Error("unreachable");
      },
    },
  });
}

export const db = (globalForPrisma.prisma as ReturnType<typeof createClient> | undefined) ?? createClient();

globalForPrisma.prisma = db as unknown as PrismaClient;
