import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Vercel deploys every route as its own serverless function, so without a
// small explicit pool size each one opens pg's default (up to 10)
// connections — with dozens of routes that blows past a small Postgres
// instance's connection limit almost immediately ("too many connections").
// Capping each function's pool to a couple of connections, plus caching the
// client on globalThis in every environment (not just dev) so a warm
// instance reuses its pool across requests instead of opening a new one
// per invocation, keeps total connections bounded.
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
  max: 3,
});

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

globalForPrisma.prisma = db;
