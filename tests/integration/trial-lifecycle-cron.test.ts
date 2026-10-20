// Integration test for app/api/cron/trial-lifecycle - audit item 9.
// Covers: the "trial ending" reminder only fires with <= 1 day left (not
// right after sign-up, when every trial starts out with <= 3 days left),
// and the "trial ended" email only goes to someone who never had a paid
// plan - a user whose paid plan later expired and fell back to "free"
// (but still carries old trial dates) must not get it. Uses a before/after
// delta on the aggregate counts so it is safe against any pre-existing
// rows in the shared local dev Postgres.
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/trial-lifecycle/route";
import { prisma } from "@/lib/prisma";
import { cleanupUser, createTestUser, testEmail, withEnv } from "./helpers";

function req(auth: string) {
  return new Request("http://localhost/api/cron/trial-lifecycle", { headers: { authorization: auth } });
}

const cleanupIds: string[] = [];
afterEach(async () => {
  while (cleanupIds.length) await cleanupUser(cleanupIds.pop()!);
});

describe("trial-lifecycle cron", () => {
  it("does not remind a brand-new trial (3 days left) but does remind one with <= 1 day left", async () => {
    await withEnv({ CRON_SECRET: "test-secret-123" }, async () => {
      const before = await (await GET(req("Bearer test-secret-123"))).json();

      const brandNew = await createTestUser({ plan: "free", trialStartedAt: new Date(), trialEndsAt: new Date(Date.now() + 3 * 86_400_000) });
      cleanupIds.push(brandNew.id);
      const almostDone = await createTestUser({ plan: "free", trialStartedAt: new Date(Date.now() - 2 * 86_400_000), trialEndsAt: new Date(Date.now() + 12 * 3_600_000) });
      cleanupIds.push(almostDone.id);

      const after = await (await GET(req("Bearer test-secret-123"))).json();
      expect(after.remindersQueued - before.remindersQueued).toBe(1);

      const brandNewReread = await prisma.user.findUnique({ where: { id: brandNew.id }, select: { trialReminderSentAt: true } });
      expect(brandNewReread?.trialReminderSentAt).toBeNull();
      const almostDoneReread = await prisma.user.findUnique({ where: { id: almostDone.id }, select: { trialReminderSentAt: true } });
      expect(almostDoneReread?.trialReminderSentAt).not.toBeNull();
    });
  });

  it("sends 'trial ended' only to someone who never had a paid plan", async () => {
    await withEnv({ CRON_SECRET: "test-secret-123" }, async () => {
      const neverPaid = await createTestUser({ plan: "free", trialStartedAt: new Date(Date.now() - 10 * 86_400_000), trialEndsAt: new Date(Date.now() - 86_400_000) });
      cleanupIds.push(neverPaid.id);

      const previouslyPaid = await createTestUser({ plan: "free", trialStartedAt: new Date(Date.now() - 10 * 86_400_000), trialEndsAt: new Date(Date.now() - 86_400_000) });
      cleanupIds.push(previouslyPaid.id);
      await prisma.payment.create({
        data: { userId: previouslyPaid.id, email: testEmail(), plan: "basic", amount: 9, method: "dodo", status: "subscription_inactive", txId: `dodo_${previouslyPaid.id}`, activatedAt: new Date(Date.now() - 40 * 86_400_000) },
      });

      await GET(req("Bearer test-secret-123"));

      const neverPaidMail = await prisma.outboundEmail.findFirst({ where: { userId: neverPaid.id, type: "trial_ended" } });
      expect(neverPaidMail).not.toBeNull();

      const previouslyPaidMail = await prisma.outboundEmail.findFirst({ where: { userId: previouslyPaid.id, type: "trial_ended" } });
      expect(previouslyPaidMail).toBeNull();
    });
  });
});
