// Billing state-machine integration test - plan-limit pausing on a downgrade,
// then resuming on a later upgrade (kalyan.md section 12, case 16 / 12g).
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPayPalMock, buildDodoMock } from "./provider-mocks";

vi.mock("@/lib/paypal", () => buildPayPalMock());
vi.mock("@/lib/dodo", () => buildDodoMock());

import { chargeOnce as recordVerifiedCharge, lifecycleOnce as applyVerifiedLifecycle } from "./typed-calls";
import { syncPlanLimits } from "@/lib/plan-limit-sync";
import { downgradeIfExpired } from "@/lib/billing-expiry";
import { LINK_LIMITS } from "@/lib/plan-limits";
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

async function makeShortLinks(userId: string, scores: number[]) {
  const rows = [];
  for (const clicks of scores) {
    rows.push(await prisma.shortLink.create({
      data: { userId, code: uid("sl"), name: "s", phone: "+10000000000", clicks },
    }));
  }
  return rows;
}

async function makeAdLinks(userId: string, scores: number[]) {
  const rows = [];
  for (const clicks of scores) {
    rows.push(await prisma.adLink.create({
      data: { userId, name: "a", number: "+10000000000", clicks },
    }));
  }
  return rows;
}

function pausedIds<T extends { id: string; planPausedAt: Date | null }>(rows: T[]) {
  return rows.filter((r) => r.planPausedAt !== null).map((r) => r.id).sort();
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

    // LINK_LIMITS.basic + 1 rotators (shared link pool: pro 100, basic 20),
    // descending scores - the new (lower) basic limit keeps the top
    // LINK_LIMITS.basic and pauses the single least-used overflow rotator.
    const rotatorScores = Array.from({ length: LINK_LIMITS.basic + 1 }, (_, i) => LINK_LIMITS.basic + 1 - i);
    const rotators = await makeRotators(userId, rotatorScores);
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
      expect(rotatorRows.map((r) => r.planPausedAt !== null)).toEqual([...Array(LINK_LIMITS.basic).fill(false), true]); // top (basic link pool) kept, 1 overflow paused

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
      expect(await prisma.rotatorLink.count({ where: { id: { in: rotators.map((r) => r.id) } } })).toBe(rotatorScores.length);
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

  // FEAT-AUDIT-HARDENING: pausing rotators/short links/ad links must only
  // happen on a real downgrade (previous plan rank strictly higher than the
  // new one). The cases below exercise that through the real trigger paths.

  it("a renewal charge for the SAME plan never pauses short links/ad links, even over the shared link pool limit", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "pro", amount: 19 });

    // Pro's shared link pool is LINK_LIMITS.pro (lib/plan-limits.ts) - 14 is
    // well within it, but that shouldn't matter: a same-plan renewal never
    // pauses regardless of pool room.
    const shortLinks = await makeShortLinks(userId, [70, 60, 50, 40, 30, 20, 10]);
    const adLinks = await makeAdLinks(userId, [70, 60, 50, 40, 30, 20, 10]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      const chargeResult = await recordVerifiedCharge({
        provider: "paypal", chargeId: uid("sale"), userId, plan: "pro", amount: 19, currency: "USD",
        subscriptionId: S0, occurredAt: new Date(), periodEnd: daysFromNow(30),
      });
      assertNotDuplicate(chargeResult);
      expect(chargeResult.classification).toBe("same");
      await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });
    });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro");

    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    const adLinkRows = await prisma.adLink.findMany({ where: { id: { in: adLinks.map((r) => r.id) } } });
    expect(pausedIds(shortLinkRows)).toEqual([]);
    expect(pausedIds(adLinkRows)).toEqual([]);
  });

  it("Growth -> Solo downgrade pauses the shared pool overflow (keeping the highest-score items across tables) and ALL ad links (not offered on Solo)", async () => {
    const user0 = await createTestUser({ plan: "free" });
    userId = user0.id; email = user0.email;
    const { subscriptionId: S0 } = await bootstrapLiveSubscription({ provider: "paypal", userId, plan: "pro", amount: 19 });

    // New basic (Solo) link pool is LINK_LIMITS.basic (lib/plan-limits.ts) -
    // (basic - 2) rotators + 3 short links is one over it. Ad links aren't
    // offered on Solo at all (AD_LINKS_AVAILABLE.basic is false), so they're
    // paused regardless of pool room, and never occupy a pool slot.
    const rotatorScores = Array.from({ length: LINK_LIMITS.basic - 2 }, (_, i) => 1000 - i); // all outscore every short link
    const rotators = await makeRotators(userId, rotatorScores);
    const shortLinks = await makeShortLinks(userId, [50, 40, 30]);
    const adLinks = await makeAdLinks(userId, [50, 40]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true", BILLING_PLAN_CHANGES_ENABLED: "true" }, async () => {
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
      expect(chargeResult.classification).toBe("expected_change");
      await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });
    });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("basic");

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(rotatorRows.every((r) => r.planPausedAt === null)).toBe(true); // all rotators outscore every short link - none paused

    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } }, orderBy: { clicks: "desc" } });
    expect(shortLinkRows.map((r) => r.planPausedAt !== null)).toEqual([false, false, true]); // pool is (basic-2) rotators + 2 short links = basic; the lowest-scoring short link overflows and gets paused

    const adLinkRows = await prisma.adLink.findMany({ where: { id: { in: adLinks.map((r) => r.id) } } });
    expect(pausedIds(adLinkRows).sort()).toEqual(adLinks.map((r) => r.id).sort()); // ad links aren't offered on Solo - all paused
  });

  it("paid plan expiring to free pauses ALL rotators/short links/ad links (Free-trial restructure: free is 0 of everything)", async () => {
    const expiresAt = new Date(Date.now() - 60_000); // already expired
    const user0 = await createTestUser({ plan: "pro", planExpiresAt: expiresAt });
    userId = user0.id; email = user0.email;

    // Free limits: rotators 0, short links 0, ad links 0 (lib/plan-limits.ts).
    const rotators = await makeRotators(userId, [30, 20, 10]);
    const shortLinks = await makeShortLinks(userId, [30, 20]);
    const adLinks = await makeAdLinks(userId, [30]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      const changed = await downgradeIfExpired({ id: userId, plan: "pro", planExpiresAt: expiresAt });
      expect(changed).toBe(true);
    });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("free");

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(pausedIds(rotatorRows).sort()).toEqual(rotators.map((r) => r.id).sort()); // free limit 0: all paused

    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(pausedIds(shortLinkRows).sort()).toEqual(shortLinks.map((r) => r.id).sort()); // free limit 0: all paused

    const adLinkRows = await prisma.adLink.findMany({ where: { id: { in: adLinks.map((r) => r.id) } } });
    expect(pausedIds(adLinkRows).sort()).toEqual(adLinks.map((r) => r.id).sort()); // free limit 0: all paused
  });

  it("an upgrade never pauses, and resumes previously plan-paused short links", async () => {
    const user0 = await createTestUser({ plan: "basic" });
    userId = user0.id; email = user0.email;

    const shortLinks = await makeShortLinks(userId, [30, 20]);
    // Simulates a short link plan-paused by an earlier real downgrade.
    await prisma.shortLink.update({ where: { id: shortLinks[1].id }, data: { planPausedAt: new Date() } });

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      await prisma.user.update({ where: { id: userId }, data: { plan: "pro" } });
      // previousPlan explicitly passed, as a real caller (recordVerifiedCharge
      // etc.) would after reading it before the update above.
      const result = await syncPlanLimits(userId, "basic");
      expect(result.shortLinks.paused).toBe(0);
      expect(result.shortLinks.resumed).toBe(1);
    });

    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(shortLinkRows.every((r) => r.planPausedAt === null)).toBe(true);
  });

  it("an unresolvable previous plan never pauses, even when the plan just went down and is now over the new limit", async () => {
    const user0 = await createTestUser({ plan: "pro" });
    userId = user0.id; email = user0.email;
    // New basic link pool is LINK_LIMITS.basic - one more short link than that is one over it.
    const shortLinkScores = Array.from({ length: LINK_LIMITS.basic + 1 }, (_, i) => LINK_LIMITS.basic + 1 - i);
    const shortLinks = await makeShortLinks(userId, shortLinkScores);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      await prisma.user.update({ where: { id: userId }, data: { plan: "basic" } });
      // No previousPlan argument: the caller could not determine it, so the
      // fail-safe (no pause) applies even though this really is a downgrade.
      const result = await syncPlanLimits(userId);
      expect(result.shortLinks.paused).toBe(0);
      expect(result.shortLinks.resumed).toBe(0);
    });

    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(shortLinkRows.every((r) => r.planPausedAt === null)).toBe(true);
  });

  // Free-trial restructure (FEAT-FREE-TRIAL): the 3-day Free trial grants
  // EXACTLY Solo-level rotator/short-link/ad-link limits for its duration
  // (previously Growth-level, under FEAT-AUDIT-HARDENING). These cases match
  // the owner's examples (a)-(d), updated for the new trial limits.

  it("(a) a new-style trial ending with no purchase pauses ALL extras (Free-trial restructure: free is 0 of everything)", async () => {
    const trialEndsAt = daysFromNow(-1); // ended yesterday - within the cron's 2-day lookback
    const trialStartedAt = new Date(trialEndsAt.getTime() - 3 * 86_400_000); // 3-day (new-style) trial
    const user0 = await createTestUser({ plan: "free", trialStartedAt, trialEndsAt, trialPlan: "pro" });
    userId = user0.id; email = user0.email;

    // Free limits: rotators 0, short links 0, ad links 0.
    const rotators = await makeRotators(userId, [30, 20, 10]);
    const shortLinks = await makeShortLinks(userId, [30, 20]);
    const adLinks = await makeAdLinks(userId, [30]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      // Mirrors app/api/cron/expire-plans/route.ts's trial-lapse sweep. No
      // previousPlan is even needed any more: resolving to "free" always
      // allows pausing now (lib/plan-limit-sync.ts).
      const result = await syncPlanLimits(userId);
      expect(result.rotators.paused).toBe(3);
      expect(result.shortLinks.paused).toBe(2);
      expect(result.adLinks.paused).toBe(1);
    });

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(pausedIds(rotatorRows).sort()).toEqual(rotators.map((r) => r.id).sort()); // free limit 0: all paused

    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(pausedIds(shortLinkRows).sort()).toEqual(shortLinks.map((r) => r.id).sort()); // free limit 0: all paused

    const adLinkRows = await prisma.adLink.findMany({ where: { id: { in: adLinks.map((r) => r.id) } } });
    expect(pausedIds(adLinkRows).sort()).toEqual(adLinks.map((r) => r.id).sort()); // free limit 0: all paused
  });

  it("(b) buying Solo during an active new-style trial pauses nothing (Free-trial restructure: the trial is ALREADY exactly Solo's limits, ignoring any legacy stored trialPlan)", async () => {
    const trialStartedAt = daysFromNow(-1);
    const trialEndsAt = daysFromNow(2); // still active at the moment of purchase
    // trialPlan "pro" is a legacy value (from the old Growth trial, pre-
    // FEAT-FREE-TRIAL) - effectivePlan/linkPlan/previousLinkPlanFor all
    // ignore it now and treat every trial as exactly Solo ("basic").
    const user0 = await createTestUser({ plan: "free", trialStartedAt, trialEndsAt, trialPlan: "pro" });
    userId = user0.id; email = user0.email;

    // Solo (basic) link pool is LINK_LIMITS.basic, ad links not offered at all. These were
    // never blocked at creation time in this test (it writes rows directly),
    // but buying Solo is a same-rank move from the trial's own Solo-equivalent
    // limits, not a downgrade - so none of them get paused by this purchase.
    const rotators = await makeRotators(userId, [50, 40, 30, 20, 10]);
    const shortLinks = await makeShortLinks(userId, [40, 30, 20]);
    const adLinks = await makeAdLinks(userId, [40, 30]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      const S0 = uid("sub");
      const t0 = new Date();
      const activated = await applyVerifiedLifecycle({
        provider: "paypal", eventId: uid("evt"), subscriptionId: S0, occurredAt: t0, userId, plan: "basic", endAccess: false,
      });
      assertLifecycleApplied(activated);
      const chargeResult = await recordVerifiedCharge({
        provider: "paypal", chargeId: uid("sale"), userId, plan: "basic", amount: 9, currency: "USD",
        subscriptionId: S0, occurredAt: new Date(t0.getTime() + 1000), periodEnd: daysFromNow(30),
      });
      assertNotDuplicate(chargeResult);
      await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });
    });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("basic");

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(rotatorRows.every((r) => r.planPausedAt === null)).toBe(true);
    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(shortLinkRows.every((r) => r.planPausedAt === null)).toBe(true);
    const adLinkRows = await prisma.adLink.findMany({ where: { id: { in: adLinks.map((r) => r.id) } } });
    expect(adLinkRows.every((r) => r.planPausedAt === null)).toBe(true);
  });

  it("(c) buying Growth during an active new-style trial pauses nothing", async () => {
    const trialStartedAt = daysFromNow(-1);
    const trialEndsAt = daysFromNow(2);
    const user0 = await createTestUser({ plan: "free", trialStartedAt, trialEndsAt, trialPlan: "pro" });
    userId = user0.id; email = user0.email;

    // Growth (pro) shared link pool is LINK_LIMITS.pro, ad links offered - all well within.
    const rotators = await makeRotators(userId, [10, 9, 8]);
    const shortLinks = await makeShortLinks(userId, [10, 9]);
    const adLinks = await makeAdLinks(userId, [10]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      const S0 = uid("sub");
      const t0 = new Date();
      const activated = await applyVerifiedLifecycle({
        provider: "paypal", eventId: uid("evt"), subscriptionId: S0, occurredAt: t0, userId, plan: "pro", endAccess: false,
      });
      assertLifecycleApplied(activated);
      const chargeResult = await recordVerifiedCharge({
        provider: "paypal", chargeId: uid("sale"), userId, plan: "pro", amount: 19, currency: "USD",
        subscriptionId: S0, occurredAt: new Date(t0.getTime() + 1000), periodEnd: daysFromNow(30),
      });
      assertNotDuplicate(chargeResult);
      await runPostTransactionActions({ cancelOld: chargeResult.cancelOld, duplicateSubscription: chargeResult.duplicateSubscription, userId });
    });

    const freshUser = await getUser(userId);
    expect(freshUser.plan).toBe("pro");

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(rotatorRows.every((r) => r.planPausedAt === null)).toBe(true);
    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(shortLinkRows.every((r) => r.planPausedAt === null)).toBe(true);
    const adLinkRows = await prisma.adLink.findMany({ where: { id: { in: adLinks.map((r) => r.id) } } });
    expect(adLinkRows.every((r) => r.planPausedAt === null)).toBe(true);
  });

  it("(d) an old-style (14-day) trial ending now pauses everything too (Free-trial restructure: free/no-trial is always pausable, no grandfathering, no previousPlan needed)", async () => {
    const trialEndsAt = daysFromNow(-1);
    const trialStartedAt = new Date(trialEndsAt.getTime() - 14 * 86_400_000); // 14-day (old-style) trial
    const user0 = await createTestUser({ plan: "free", trialStartedAt, trialEndsAt, trialPlan: "pro" });
    userId = user0.id; email = user0.email;

    const rotators = await makeRotators(userId, [30, 20, 10]);
    const shortLinks = await makeShortLinks(userId, [30, 20]);

    await withEnv({ PLAN_LIMIT_PAUSING_ENABLED: "true" }, async () => {
      // Mirrors the cron (app/api/cron/expire-plans): no previousPlan is
      // passed, and none is needed - the user now resolves to "free" (their
      // old-style trial grandfathering is gone), which is always pausable.
      const result = await syncPlanLimits(userId);
      expect(result.rotators.paused).toBe(3);
      expect(result.shortLinks.paused).toBe(2);
    });

    const rotatorRows = await prisma.rotatorLink.findMany({ where: { id: { in: rotators.map((r) => r.id) } } });
    expect(pausedIds(rotatorRows).sort()).toEqual(rotators.map((r) => r.id).sort());
    const shortLinkRows = await prisma.shortLink.findMany({ where: { id: { in: shortLinks.map((r) => r.id) } } });
    expect(pausedIds(shortLinkRows).sort()).toEqual(shortLinks.map((r) => r.id).sort());
  });
});
