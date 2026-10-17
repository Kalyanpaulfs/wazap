import { describe, expect, it } from "vitest";
import { routerQuota } from "../router-entitlements";

const now = new Date("2026-11-01T12:00:00.000Z");
const created = new Date("2026-10-30T00:00:00.000Z"); // after the legacy grace window
const trialUser = { plan: "free", trialPlan: "basic", trialEndsAt: new Date("2026-11-02T00:00:00.000Z"), createdAt: created };
const freeUser = { plan: "free", trialPlan: null, trialEndsAt: new Date("2026-10-31T00:00:00.000Z"), createdAt: created };

describe("routerQuota (Free-trial restructure: unlimited on trial, blocked on free/no-trial)", () => {
  it("gives unlimited leads during an active trial, however many are already used", () => {
    const q = routerQuota(trialUser, 60, now);
    expect(q.limit).toBeNull();
    expect(q.plan).toBe("basic");
    expect(q.allowed).toBe(true);
    expect(routerQuota(trialUser, 100_000, now).allowed).toBe(true);
  });

  it("blocks all routing once the trial has ended (free/no-trial) - no lifetime allowance any more", () => {
    const q = routerQuota(freeUser, 60, now);
    expect(q.limit).toBe(0);
    expect(q.plan).toBe("free");
    expect(q.allowed).toBe(false);
    // Even at zero used, free/no-trial is blocked - there is no free allowance left to spend.
    expect(routerQuota(freeUser, 0, now).allowed).toBe(false);
  });

  it("stays unlimited on a paid plan", () => {
    const q = routerQuota({ plan: "basic", planExpiresAt: new Date("2026-12-01T00:00:00.000Z"), createdAt: created }, 500, now);
    expect(q.limit).toBeNull();
    expect(q.allowed).toBe(true);
  });
});
