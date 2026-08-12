import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Vercel deploys every route as its own serverless function, so without a
// small explicit pool size each one opens pg's default (up to 10)
// connections — with dozens of routes that blows past a small Postgres
// instance's connection limit almost immediately ("too many connections").
// max: 1 stopped that, but it also serialized every page's parallel
// Promise.all() queries onto a single connection, which was the bigger
// contributor to slow page loads. 5 leaves room for a page's queries to
// actually run concurrently while still bounding total connections per
// warm instance. Caching the client on globalThis in every environment
// (not just dev) means a warm instance reuses its pool across requests
// instead of opening a new one per invocation.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 5,
});

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = db;
