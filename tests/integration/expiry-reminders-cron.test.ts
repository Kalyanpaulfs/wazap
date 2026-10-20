// Integration test for app/api/cron/expiry-reminders - audit item 4.
// Covers: CRON_SECRET must be set and matched (reject when unset), and the
// auto-renew skip now reads the real SecurityUserBilling.autoRenew pointer
// (both PayPal and Dodo), not the old "did a card/dodo payment land
// recently" heuristic that only ever recognised Dodo. EMAIL_AUTOMATION_READY
// is kept off throughout so the route never attempts a real send and never
// writes expiryReminderSentFor on any (possibly pre-existing) row - this
// test only reads the aggregate counts via a before/after delta, so it is
// safe to run against the shared local dev Postgres.
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/expiry-reminders/route";
import { prisma } from "@/lib/prisma";
import { cleanupUser, createTestUser, daysFromNow, withEnv } from "./helpers";

function req(auth: string | null) {
  const headers = new Headers();
  if (auth !== null) headers.set("authorization", auth);
  return new Request("http://localhost/api/cron/expiry-reminders", { headers });
}

const cleanupIds: string[] = [];
afterEach(async () => {
  while (cleanupIds.length) {
    const id = cleanupIds.pop()!;
    await cleanupUser(id);
  }
});

describe("expiry-reminders cron auth", () => {
  it("rejects when CRON_SECRET is unset, even with a guessed header", async () => {
    await withEnv({ CRON_SECRET: undefined }, async () => {
      const res = await GET(req("Bearer anything"));
      expect(res.status).toBe(401);
    });
  });

  it("rejects a wrong secret and accepts the right one", async () => {
    await withEnv({ CRON_SECRET: "test-secret-123", EMAIL_AUTOMATION_READY: undefined }, async () => {
      expect((await GET(req("Bearer wrong"))).status).toBe(401);
      expect((await GET(req(null))).status).toBe(401);
      expect((await GET(req("Bearer test-secret-123"))).status).toBe(200);
    });
  });
});

describe("expiry-reminders cron auto-renew gating", () => {
  it("skips auto-renewing users on either provider, and reminds non-renewing users", async () => {
    await withEnv({ CRON_SECRET: "test-secret-123", EMAIL_AUTOMATION_READY: undefined }, async () => {
      const before = await (await GET(req("Bearer test-secret-123"))).json();

      const paypalAutoRenew = await createTestUser({ plan: "basic", planExpiresAt: daysFromNow(2) });
      cleanupIds.push(paypalAutoRenew.id);
      await prisma.securityUserBilling.create({
        data: { userId: paypalAutoRenew.id, provider: "paypal", subscriptionId: `sub_${paypalAutoRenew.id}`, occurredAt: new Date(), autoRenew: true },
      });

      const dodoNotRenewing = await createTestUser({ plan: "pro", planExpiresAt: daysFromNow(1) });
      cleanupIds.push(dodoNotRenewing.id);
      await prisma.securityUserBilling.create({
        data: { userId: dodoNotRenewing.id, provider: "dodo", subscriptionId: `sub_${dodoNotRenewing.id}`, occurredAt: new Date(), autoRenew: false },
      });

      // No SecurityUserBilling row at all - defaults to auto-renew (same
      // default as lib/billing-summary.ts), so this one is skipped too.
      const noPointer = await createTestUser({ plan: "ultimate", planExpiresAt: daysFromNow(2) });
      cleanupIds.push(noPointer.id);

      const after = await (await GET(req("Bearer test-secret-123"))).json();

      expect(after.candidates - before.candidates).toBe(3);
      expect(after.skippedAutoRenew - before.skippedAutoRenew).toBe(2); // paypalAutoRenew + noPointer
      expect(after.needReminder - before.needReminder).toBe(1); // dodoNotRenewing only
      expect(after.sent - before.sent).toBe(0); // EMAIL_AUTOMATION_READY is off

      // Side-effect-free: nothing got marked as reminded (email never configured).
      const reread = await prisma.user.findUnique({ where: { id: dodoNotRenewing.id }, select: { expiryReminderSentFor: true } });
      expect(reread?.expiryReminderSentFor).toBeNull();
    });
  });
});
