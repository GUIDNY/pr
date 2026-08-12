// Split out from auth.ts so the Prisma seed script (run via plain `tsx`,
// outside the Next.js bundler) can hash demo passwords without pulling in
// `server-only` or `next/headers`, which only resolve inside the Next build.
import bcrypt from "bcryptjs";

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}
