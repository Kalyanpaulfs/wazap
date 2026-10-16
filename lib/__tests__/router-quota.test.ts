import { describe, expect, it } from "vitest";
import { routerQuota, FREE_ROUTED_LEADS_LIFETIME, TRIAL_ROUTED_LEADS_LIFETIME } from "../router-entitlements";

const now = new Date("2026-11-01T12:00:00.000Z");
const created = new Date("2026-10-30T00:00:00.000Z"); // after the legacy grace window
const trialUser = { plan: "free", trialPlan: "basic", trialEndsAt: new Date("2026-11-02T00:00:00.000Z"), createdAt: created };
const freeUser = { plan: "free", trialPlan: null, trialEndsAt: new Date("2026-10-31T00:00:00.000Z"), createdAt: created };

describe("routerQuota trial cap", () => {
  it("gives 100 leads during an active trial", () => {
    const q = routerQuota(trialUser, 60, now);
    expect(q.limit).toBe(TRIAL_ROUTED_LEADS_LIFETIME);
    expect(q.allowed).toBe(true);
    expect(routerQuota(trialUser, 100, now).allowed).toBe(false);
  });

  it("goes back to the free 25 after the trial ends", () => {
    const q = routerQuota(freeUser, 60, now);
    expect(q.limit).toBe(FREE_ROUTED_LEADS_LIFETIME);
    expect(q.allowed).toBe(false);
  });

  it("stays unlimited on a paid plan", () => {
    const q = routerQuota({ plan: "basic", planExpiresAt: new Date("2026-12-01T00:00:00.000Z"), createdAt: created }, 500, now);
    expect(q.limit).toBeNull();
    expect(q.allowed).toBe(true);
  });
});
