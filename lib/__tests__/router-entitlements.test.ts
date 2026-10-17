import { describe, expect, it } from "vitest";
import { linkPlan, routerPlan, canRouteLinks } from "@/lib/router-entitlements";

const DAY_MS = 24 * 60 * 60 * 1000;

// Free-trial restructure (FEAT-FREE-TRIAL): the Free trial is EXACTLY Solo's
// limits plus unlimited routed leads. linkPlan now governs BOTH how many
// rotators/short links/ad links a user may HAVE and whether leads route at
// all - routerPlan is just an alias for linkPlan (no more paid-only lead
// metering split). The stored trialPlan is ignored: a trial always resolves
// to "basic" (pre-restructure accounts can carry trialPlan: "pro" from the
// old Growth trial, and must not get Growth limits).
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

  it("falls back to free when the paid plan is expired, even with a trial on record", () => {
    expect(linkPlan({
      plan: "pro",
      planExpiresAt: new Date(Date.now() - 60_000),
      trialPlan: "pro",
      trialEndsAt: new Date(Date.now() + DAY_MS),
    })).toBe("free"); // isProductTrialActive requires the stored plan to be "free" - an expired paid plan does not qualify
  });

  it("boosts a free user to Solo ('basic') during an active product trial, ignoring the stored trialPlan", () => {
    expect(linkPlan({ plan: "free", trialPlan: "pro", trialEndsAt: new Date(Date.now() + DAY_MS) })).toBe("basic");
  });

  it("is free for a free user whose trial has ended", () => {
    expect(linkPlan({ plan: "free", trialPlan: "pro", trialEndsAt: new Date(Date.now() - DAY_MS) })).toBe("free");
  });

  it("is free for a free user who never trialled", () => {
    expect(linkPlan({ plan: "free" })).toBe("free");
  });
});

describe("linkPlan vs routerPlan (no longer diverge - routerPlan is an alias)", () => {
  it("agree for a free user on an active trial: both resolve to Solo ('basic')", () => {
    const user = { plan: "free", trialPlan: "pro", trialEndsAt: new Date(Date.now() + DAY_MS) };
    expect(linkPlan(user)).toBe("basic");
    expect(routerPlan(user)).toBe("basic");
    expect(canRouteLinks(user)).toBe(true);
  });

  it("agree once there is a real paid, unexpired plan", () => {
    const user = { plan: "ultimate", planExpiresAt: new Date(Date.now() + DAY_MS) };
    expect(linkPlan(user)).toBe("ultimate");
    expect(routerPlan(user)).toBe("ultimate");
    expect(canRouteLinks(user)).toBe(true);
  });

  it("agree for free/no-trial: both free, and routing is blocked", () => {
    const user = { plan: "free" };
    expect(linkPlan(user)).toBe("free");
    expect(routerPlan(user)).toBe("free");
    expect(canRouteLinks(user)).toBe(false);
  });
});
