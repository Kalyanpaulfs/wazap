import { describe, expect, it } from "vitest";
import { linkPlan, routerPlan } from "@/lib/router-entitlements";

const DAY_MS = 24 * 60 * 60 * 1000;

// Owner decision (FEAT-AUDIT-HARDENING trial links): linkPlan gates how many
// rotators/short links/ad links a user may HAVE (and numbers per rotator) -
// a paid, non-expired plan always wins; otherwise an active product trial
// boosts a free user up to the trial plan; otherwise free. routerPlan (lead
// metering) must stay paid-only/no trial boost, unaffected by this feature.
describe("linkPlan", () => {
  it("is free for no user / null", () => {
    expect(linkPlan(null)).toBe("free");
    expect(linkPlan(undefined)).toBe("free");
  });

  it("returns the paid plan when active and unexpired", () => {
    expect(linkPlan({ plan: "pro", planExpiresAt: new Date(Date.now() + 10 * DAY_MS) })).toBe("pro");
    expect(linkPlan({ plan: "basic", planExpiresAt: null })).toBe("basic");
  });

  it("maps a legacy 'business' plan onto ultimate", () => {
    expect(linkPlan({ plan: "business", planExpiresAt: null })).toBe("ultimate");
  });

  it("falls back to free when the paid plan is expired and there is no trial", () => {
    expect(linkPlan({ plan: "pro", planExpiresAt: new Date(Date.now() - 60_000) })).toBe("free");
  });

  it("falls back to the trial plan when the paid plan is expired but a product trial is active", () => {
    expect(linkPlan({
      plan: "pro",
      planExpiresAt: new Date(Date.now() - 60_000),
      trialPlan: "pro",
      trialEndsAt: new Date(Date.now() + DAY_MS),
    })).toBe("free"); // isProductTrialActive requires the stored plan to be "free" - an expired paid plan does not qualify
  });

  it("boosts a free user up to the trial plan during an active product trial", () => {
    expect(linkPlan({ plan: "free", trialPlan: "pro", trialEndsAt: new Date(Date.now() + DAY_MS) })).toBe("pro");
  });

  it("is free for a free user whose trial has ended", () => {
    expect(linkPlan({ plan: "free", trialPlan: "pro", trialEndsAt: new Date(Date.now() - DAY_MS) })).toBe("free");
  });

  it("is free for a free user who never trialled", () => {
    expect(linkPlan({ plan: "free" })).toBe("free");
  });
});

describe("linkPlan vs routerPlan (the trial-boost split)", () => {
  it("diverge for a free user on an active trial: linkPlan boosts, routerPlan stays free", () => {
    const user = { plan: "free", trialPlan: "pro", trialEndsAt: new Date(Date.now() + DAY_MS) };
    expect(linkPlan(user)).toBe("pro");
    expect(routerPlan(user)).toBe("free");
  });

  it("agree once there is a real paid, unexpired plan", () => {
    const user = { plan: "ultimate", planExpiresAt: new Date(Date.now() + DAY_MS) };
    expect(linkPlan(user)).toBe("ultimate");
    expect(routerPlan(user)).toBe("ultimate");
  });
});
