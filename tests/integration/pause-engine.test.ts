// Billing state-machine integration test - plan-limit pausing on a downgrade,
// then resuming on a later upgrade (kalyan.md section 12, case 16 / 12g).
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayPalMock, buildDodoMock } from "./provider-mocks";

vi.mock("@/lib/paypal", () => buildPayPalMock());
vi.mock("@/lib/dodo", () => buildDodoMock());

import { chargeOnce as recordVerifiedCharge, lifecycleOnce as applyVerifiedLifecycle } from "./typed-calls";
import { syncPlanLimits } from "@/lib/plan-limit-sync";
import { prisma } from "@/lib/prisma";
import {
  assertLifecycleApplied, assertNotDuplicate, cleanupUser, createTestUser, daysFromNow, getUser, getWorkspaceId, uid, withEnv,
} from "./helpers";
import { bootstrapLiveSubscription, createPendingChange } from "./scenarios";
import { cancelOldForScheduledActivation, runPostTransactionActions } from "./wiring";

async function makeRotators(userId: string, scores: number[]) {
  const rows = [];
  for (const totalClicks of scores) {
    rows.push(await prisma.rotatorLink.create({
      data: { userId, code: uid("rot"), name: "r", numbers: ["+10000000000"], totalClicks },
    }));
  }
  return rows;
}

async function makeAutomations(workspaceId: string, specs: Array<{ status: string; lastRunAt: Date | null }>) {
  const rows = [];
  for (const spec of specs) {
    rows.push(await prisma.automationRule.create({
      data: { workspaceId, name: "a", trigger: "manual", status: spec.status, conditions: {}, actions: {}, lastRunAt: spec.lastRunAt },
    }));
  }
  return rows;
}

describe("Case 16: plan-limit pausing engine", () => {
  let userId = "";
  let email = "";
  afterEach(async () => { if (userId) await cleanupUser(userId, { email }); });

  it("pauses extras over the new (lower) plan's limit, keeping the most-used, and leaves a self-paused item alone", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const workspaceId = await getWorkspaceId(userId);

    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "pro", amount: 19 });

    // 5 rotators (pro limit 10, basic limit 3): scores 50 > 40 > 30 > 20 > 10.
    const rotators = await makeRotators(userId, [50, 40, 30, 20, 10]);
    // 5 automations (pro limit 10, basic limit 3): 4 active with distinct
    // lastRunAt, plus one the user paused themselves (status "paused",
    // never touched by the plan-limit engine).
    const now = Date.now();
    const automations = await makeAutomations(workspaceId, [
      { status: "active", lastRunAt: new Date(now - 1 * 86_400_000) }, // most recently run
      { status: "active", lastRunAt: new Date(now - 2 * 86_400_000) },
      { status: "active", lastRunAt: new Date(now - 3 * 86_400_000) },
      { status: "active", lastRunAt: new Date(now - 4 * 86_400_000) }, // least recently run
      { status: "paused", lastRunAt: null }, // self-paused by the user
    ]);
    const selfPausedId = automations[4].id;

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true", BILLING_PLAN_CHANGES_ENABLED: "true" }, async () => {
      // Scheduled downgrade pro -> basic, same shape as case 5.
      const S1 = uid("sub");
      const effectiveAt = daysFromNow(27);
      await createPendingChange({ userId, kind: "downgrade", fromPlan: "pro", toPlan: "basic", provider: "paypal", oldSubscriptionId: S0, newSubscriptionId: S1, effectiveAt });

      const activated = await applyVerifiedLifecycle({
        provider: "paypal", eventId: uid("evt"), subscriptionId: S1, occurredAt: new Date(), userId, plan: "basic", endAccess: false,
      });
      assertLifecycleApplied(activated);
      await runPostTransactionActions({ cancelOld: cancelOldForScheduledActivation(activated.scheduledActivated), duplicateSubscription: activated.duplicateSubscription, userId });

      const chargeResult = await recordVerifiedCharge({
        provider: "paypal", chargeId: uid("sale"), userId, plan: "basic", amount: 9, currency: "USD",
        subscriptionId: S1, occurredAt: new Date(effectiveAt.getTime() + 1000), periodEnd: daysFromNow(30),
      });
      assertNotDuplicate(chargeResult);
      await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });

      const freshUser = await getUser(userId);
      expect(freshUser.plan).toBe("basic");

      const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } }, orderBy: { totalClicks: "desc" } });
      expect(rotatorRows.map((r) => r.planPausedAt !== null)).toEqual([false, false, false, true, true]); // top 3 (basic limit) kept

      const automationRows = await prisma.automationRule.findMany({ where: { id: { in: automations.map((a) => a.id) } } });
      const selfPaused = automationRows.find((a) => a.id === selfPausedId)!;
      expect(selfPaused.status).toBe("paused");
      expect(selfPaused.planPausedAt).toBeNull(); // never touched by the plan-limit engine

      const activeOnes = automationRows.filter((a) => a.id !== selfPausedId).sort((a, b) => (b.lastRunAt?.getTime() ?? 0) - (a.lastRunAt?.getTime() ?? 0));
      // basic limit 3, minus 1 "other" row (the self-paused one) = 2 kept.
      expect(activeOnes[0].planPausedAt).toBeNull();
      expect(activeOnes[0].status).toBe("active");
      expect(activeOnes[1].planPausedAt).toBeNull();
      expect(activeOnes[1].status).toBe("active");
      expect(activeOnes[2].planPausedAt).not.toBeNull();
      expect(activeOnes[2].status).toBe("paused");
      expect(activeOnes[2].planPausedFromStatus).toBe("active");
      expect(activeOnes[3].planPausedAt).not.toBeNull();
      expect(activeOnes[3].status).toBe("paused");

      // Upgrading back resumes only the plan-paused ones.
      await prisma.user.update({ where: { id: userId }, data: { plan: "pro" } });
      await syncPlanLimits(userId);

      const rotatorRowsAfterUpgrade = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
      expect(rotatorRowsAfterUpgrade.every((r) => r.planPausedAt === null)).toBe(true);

      const automationRowsAfterUpgrade = await prisma.automationRule.findMany({ where: { id: { in: automations.map((a) => a.id) } } });
      const selfPausedAfterUpgrade = automationRowsAfterUpgrade.find((a) => a.id === selfPausedId)!;
      expect(selfPausedAfterUpgrade.status).toBe("paused"); // stays paused - the user paused it, not the plan
      expect(selfPausedAfterUpgrade.planPausedAt).toBeNull();
      const othersAfterUpgrade = automationRowsAfterUpgrade.filter((a) => a.id !== selfPausedId);
      expect(othersAfterUpgrade.every((a) => a.planPausedAt === null && a.status === "active")).toBe(true);

      // Nothing was ever deleted.
      expect(await prisma.rotatorLink.count({ where: { id: { in: rotators.map((r) => r.id) } } })).toBe(5);
      expect(await prisma.automationRule.count({ where: { id: { in: automations.map((a) => a.id) } } })).toBe(5);
    });
  });

  it("pauses nothing when PLAN_LIMIT_PAUSING_ENABLED is off", async () => {
    const user0 = await createTestUser({ plan: "pro", planExpiresAt: daysFromNow(30) });
    userId = user0.id; email = user0.email;
    const rotators = await makeRotators(userId, [5, 4, 3, 2, 1]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: undefined }, async () => {
      await prisma.user.update({ where: { id: userId }, data: { plan: "basic" } });
      const result = await syncPlanLimits(userId);
      expect(result.rotators).toEqual({ paused: 0, resumed: 0 });
    });

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(rotatorRows.every((r) => r.planPausedAt === null)).toBe(true);
  });
});
