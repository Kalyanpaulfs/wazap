// Integration test for lib/account-lifecycle.ts accountClosureBlockers and
// permanentlyDeleteAccount - audit item 5. A Dodo subscription keeps its
// Payment row "subscription_active" until the paid period really ends even
// after the customer turns auto-pay off (unlike PayPal, whose row flips to
// subscription_inactive immediately on cancellation - see
// app/api/billing/autopay/route.ts). accountClosureBlockers must stop
// treating a non-renewing Dodo subscription as a blocker, and the
// account-lifecycle cron (permanentlyDeleteAccount) must not use a stale
// "blocked" read to silently cancel an already-scheduled deletion.
import { afterEach, describe, expect, it } from "vitest";
import { accountClosureBlockers, permanentlyDeleteAccount } from "@/lib/account-lifecycle";
import { prisma } from "@/lib/prisma";
import { cleanupUser, createTestUser, testEmail } from "./helpers";

async function makeDodoUser(autoRenew: boolean | "none") {
  const user = await createTestUser({ plan: "pro", planExpiresAt: new Date(Date.now() + 10 * 86_400_000) });
  await prisma.payment.create({
    data: { userId: user.id, email: testEmail(), plan: "pro", amount: 19, method: "dodo", status: "subscription_active", txId: `dodo_${user.id}` },
  });
  if (autoRenew !== "none") {
    await prisma.securityUserBilling.create({
      data: { userId: user.id, provider: "dodo", subscriptionId: `dodo_${user.id}`, occurredAt: new Date(), autoRenew },
    });
  }
  return user;
}

describe("accountClosureBlockers - Dodo auto-pay off", () => {
  afterEach(async () => {
    // best-effort; some test cases delete the user themselves
  });

  it("blocks when the Dodo subscription still auto-renews", async () => {
    const user = await makeDodoUser(true);
    try {
      const result = await accountClosureBlockers(user.id);
      expect(result.billing).toEqual({ method: "dodo", plan: "pro" });
    } finally {
      await cleanupUser(user.id);
    }
  });

  it("blocks when there is no SecurityUserBilling pointer yet (defaults to auto-renew)", async () => {
    const user = await makeDodoUser("none");
    try {
      const result = await accountClosureBlockers(user.id);
      expect(result.billing).toEqual({ method: "dodo", plan: "pro" });
    } finally {
      await cleanupUser(user.id);
    }
  });

  it("does NOT block once auto-pay is off, even though the Payment row is still subscription_active", async () => {
    const user = await makeDodoUser(false);
    try {
      const result = await accountClosureBlockers(user.id);
      expect(result.billing).toBeNull();
    } finally {
      await cleanupUser(user.id);
    }
  });

  it("permanentlyDeleteAccount does not undo a scheduled deletion for a non-renewing Dodo user", async () => {
    const user = await makeDodoUser(false);
    await prisma.user.update({
      where: { id: user.id },
      data: { accountDeletionRequestedAt: new Date(Date.now() - 8 * 86_400_000), accountDeletionScheduledFor: new Date(Date.now() - 1000) },
    });
    const result = await permanentlyDeleteAccount(user.id);
    expect(result.reason).not.toBe("blocked");
    expect(result.deleted).toBe(true);
    // Account is gone already - nothing left to clean up via cleanupUser.
  });

  it("permanentlyDeleteAccount still refuses (and clears the schedule) for an auto-renewing Dodo user", async () => {
    const user = await makeDodoUser(true);
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { accountDeletionRequestedAt: new Date(Date.now() - 8 * 86_400_000), accountDeletionScheduledFor: new Date(Date.now() - 1000) },
      });
      const result = await permanentlyDeleteAccount(user.id);
      expect(result).toEqual({ deleted: false, reason: "blocked" });
      const reread = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(reread.accountDeletionScheduledFor).toBeNull();
    } finally {
      await cleanupUser(user.id);
    }
  });
});
