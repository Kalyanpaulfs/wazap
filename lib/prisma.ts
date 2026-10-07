import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ log: ["error"] });

// Next.js can evaluate server chunks independently. Keep one process-wide
// client in production as well as development to prevent competing pools from
// exhausting PostgreSQL connections under concurrent traffic.
globalForPrisma.prisma = prisma;
