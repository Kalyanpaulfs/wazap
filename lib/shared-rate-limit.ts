import { createHash } from "node:crypto";
import { prisma } from "./prisma";

// PostgreSQL owns the clock and atomically increments the shared bucket.
export async function sharedRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  if (limit < 1 || windowMs < 1 || !Number.isFinite(windowMs)) return false;
  try {
    const digest = createHash("sha256").update(key).digest("hex");
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "SecurityRateLimit" ("key", "count", "resetAt")
      VALUES (${digest}, 1, clock_timestamp() + ${windowMs} * interval '1 millisecond')
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "SecurityRateLimit"."resetAt" <= clock_timestamp() THEN 1 ELSE LEAST("SecurityRateLimit"."count" + 1, ${limit + 1}) END,
        "resetAt" = CASE WHEN "SecurityRateLimit"."resetAt" <= clock_timestamp() THEN clock_timestamp() + ${windowMs} * interval '1 millisecond' ELSE "SecurityRateLimit"."resetAt" END
      RETURNING "count"
    `;
    return rows[0]?.count <= limit;
  } catch {
    console.error("[security] shared authentication limiter unavailable");
    return false;
  }
}
