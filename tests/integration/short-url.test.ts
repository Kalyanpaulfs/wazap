// TOOL-FREE-2 Link shortener - DB-backed checks the pure unit tests
// (lib/__tests__/short-url*.test.ts, safe-browsing.test.ts) can't cover:
// the real Postgres schema/migration (prisma/short_urls_20261022.sql),
// the unique `code` constraint, the click-increment the redirect route
// performs, the report -> auto-disable transaction, and cascade delete.
// Session-based HTTP testing (a real signed-in request to the Next.js
// route) isn't practical here - this exercises the same Prisma operations
// the route handlers perform, against the real local database, instead.
import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { randomShortCode, buildShortUrlPublicUrl, validateTargetUrl } from "@/lib/short-url";
import { shouldAutoDisable, hashReporterIp } from "@/lib/short-url-reports";
import { createTestUser, cleanupUser } from "./helpers";

const createdUserIds: string[] = [];
afterAll(async () => {
  for (const id of createdUserIds) await cleanupUser(id).catch(() => {});
  await prisma.$disconnect();
});

async function uniqueCode() {
  let code = randomShortCode();
  while (await prisma.shortUrl.findUnique({ where: { code }, select: { id: true } })) code = randomShortCode();
  return code;
}

describe("ShortUrl (TOOL-FREE-2) against the real local Postgres", () => {
  it("creates a short link, builds its public URL, and the code is unique in the DB", async () => {
    const user = await createTestUser({ plan: "basic" });
    createdUserIds.push(user.id);

    const validation = validateTargetUrl("https://example.com/landing-page");
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;

    const code = await uniqueCode();
    const link = await prisma.shortUrl.create({ data: { userId: user.id, code, targetUrl: validation.url.toString() } });

    expect(link.clicks).toBe(0);
    expect(link.reportCount).toBe(0);
    expect(link.disabledAt).toBeNull();
    expect(buildShortUrlPublicUrl(link.code)).toBe(`${new URL(process.env.NEXTAUTH_URL || "https://wazap.lt").origin}/s/${code}`);

    const found = await prisma.shortUrl.findUnique({ where: { code } });
    expect(found?.userId).toBe(user.id);
  });

  it("rejects a second short link with the same custom code (DB unique constraint)", async () => {
    const user = await createTestUser({ plan: "basic" });
    createdUserIds.push(user.id);
    const code = "qa-" + Math.random().toString(36).slice(2, 8);
    await prisma.shortUrl.create({ data: { userId: user.id, code, targetUrl: "https://example.com/one" } });

    await expect(
      prisma.shortUrl.create({ data: { userId: user.id, code, targetUrl: "https://example.com/two" } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("the redirect route's click increment is atomic and durable", async () => {
    const user = await createTestUser({ plan: "basic" });
    createdUserIds.push(user.id);
    const code = await uniqueCode();
    const link = await prisma.shortUrl.create({ data: { userId: user.id, code, targetUrl: "https://example.com/click-me" } });

    // Same shape as app/s/[code]/route.ts's click increment, run concurrently
    // the way simultaneous visitors would hit it.
    await Promise.all(Array.from({ length: 10 }, () => prisma.shortUrl.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } })));

    const updated = await prisma.shortUrl.findUniqueOrThrow({ where: { id: link.id } });
    expect(updated.clicks).toBe(10);
  });

  it("3 reports auto-disables the link, exactly like app/api/short-urls/report/route.ts", async () => {
    const user = await createTestUser({ plan: "basic" });
    createdUserIds.push(user.id);
    const code = await uniqueCode();
    const link = await prisma.shortUrl.create({ data: { userId: user.id, code, targetUrl: "https://example.com/reported" } });

    for (let i = 0; i < 3; i++) {
      const reporterIp = hashReporterIp(`203.0.113.${i}`);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.shortUrlReport.create({ data: { shortUrlId: link.id, reason: "phishing", reporterIp } });
        return tx.shortUrl.update({ where: { id: link.id }, data: { reportCount: { increment: 1 } } });
      });
      if (shouldAutoDisable(updated.reportCount)) {
        await prisma.shortUrl.update({ where: { id: link.id }, data: { disabledAt: new Date(), disabledReason: "reported" } });
      }
    }

    const final = await prisma.shortUrl.findUniqueOrThrow({ where: { id: link.id } });
    expect(final.reportCount).toBe(3);
    expect(final.disabledAt).not.toBeNull();
    expect(final.disabledReason).toBe("reported");

    const reports = await prisma.shortUrlReport.findMany({ where: { shortUrlId: link.id } });
    expect(reports).toHaveLength(3);
    for (const report of reports) expect(report.reporterIp).not.toContain("203.0.113");
  });

  it("deleting the owning user cascades ShortUrl and ShortUrlReport", async () => {
    const user = await createTestUser({ plan: "basic" });
    const code = await uniqueCode();
    const link = await prisma.shortUrl.create({ data: { userId: user.id, code, targetUrl: "https://example.com/cascade" } });
    await prisma.shortUrlReport.create({ data: { shortUrlId: link.id, reason: "spam", reporterIp: hashReporterIp("198.51.100.1") } });

    await cleanupUser(user.id);

    expect(await prisma.shortUrl.findUnique({ where: { id: link.id } })).toBeNull();
    expect(await prisma.shortUrlReport.findMany({ where: { shortUrlId: link.id } })).toHaveLength(0);
  });
});
