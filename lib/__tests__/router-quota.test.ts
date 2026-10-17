import { describe, expect, it } from "vitest";
import { routerQuota, TRIAL_ROUTED_LEADS } from "../router-entitlements";

const now = new Date("2026-11-01T12:00:00.000Z");
const created = new Date("2026-10-30T00:00:00.000Z"); // after the legacy grace window
const trialUser = { plan: "free", trialPlan: "basic", trialEndsAt: new Date("2026-11-02T00:00:00.000Z"), createdAt: created };
const freeUser = { plan: "free", trialPlan: null, trialEndsAt: new Date("2026-10-31T00:00:00.000Z"), createdAt: created };

describe("routerQuota (100-lead trial cap, FEAT-TRIAL-100-LEADS)", () => {
  it("allows routing while under the 100-lead trial cap", () => {
    const q = routerQuota(trialUser, 60, now);
    expect(q.limit).toBe(TRIAL_ROUTED_LEADS);
    expect(q.plan).toBe("basic");
    expect(q.allowed).toBe(true);
    expect(q.remaining).toBe(TRIAL_ROUTED_LEADS - 60);
  });

  it("allows the 99th trial lead", () => {
    const q = routerQuota(trialUser, 99, now);
    expect(q.allowed).toBe(true);
    expect(q.remaining).toBe(1);
  });

  it("blocks once the trial has used exactly 100 leads", () => {
    const q = routerQuota(trialUser, 100, now);
    expect(q.allowed).toBe(false);
    expect(q.remaining).toBe(0);
    expect(q.limit).toBe(TRIAL_ROUTED_LEADS);
  });

  it("stays blocked well past the 100-lead cap", () => {
    expect(routerQuota(trialUser, 100_000, now).allowed).toBe(false);
  });

  it("blocks all routing once the trial has ended (free/no-trial) - no lifetime allowance any more", () => {
    const q = routerQuota(freeUser, 60, now);
    expect(q.limit).toBe(0);
    expect(q.plan).toBe("free");
    expect(q.allowed).toBe(false);
    // Even at zero used, free/no-trial is blocked - there is no free allowance left to spend.
    expect(routerQuota(freeUser, 0, now).allowed).toBe(false);
  });

  it("stays unlimited on a paid plan, however many leads are already used", () => {
    const q = routerQuota({ plan: "basic", planExpiresAt: new Date("2026-12-01T00:00:00.000Z"), createdAt: created }, 500, now);
    expect(q.limit).toBeNull();
    expect(q.allowed).toBe(true);
    expect(routerQuota({ plan: "basic", planExpiresAt: new Date("2026-12-01T00:00:00.000Z"), createdAt: created }, 100_000, now).allowed).toBe(true);
  });
});
