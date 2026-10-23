import { describe, expect, it } from "vitest";
import {
  getCustomerAccountStatus,
  computeUsageVsLimits,
  areCustomerLinksPaused,
  customerDaysRemaining,
  customerPlanLabel,
  customerSegmentKey,
  customerPlanPill,
  accountStatusPill,
} from "../admin-customer";

describe("admin-customer helpers", () => {
  describe("getCustomerAccountStatus", () => {
    it("identifies active accounts", () => {
      const res = getCustomerAccountStatus({
        email: "customer@example.com",
        accountDeletionScheduledFor: null,
      });
      expect(res.status).toBe("active");
      expect(res.scheduledFor).toBeNull();
    });

    it("identifies closing accounts with scheduled deletion date", () => {
      const scheduled = new Date(Date.now() + 5 * 86_400_000);
      const requested = new Date(Date.now() - 2 * 86_400_000);
      const res = getCustomerAccountStatus({
        email: "closing@example.com",
        accountDeletionScheduledFor: scheduled,
        accountDeletionRequestedAt: requested,
      });
      expect(res.status).toBe("closing");
      expect(res.scheduledFor).toEqual(scheduled);
      expect(res.requestedAt).toEqual(requested);
    });

    it("identifies deleted accounts by email pattern", () => {
      const res1 = getCustomerAccountStatus({ email: "deleted+abc1234567890@wazap.invalid" });
      expect(res1.status).toBe("deleted");

      const res2 = getCustomerAccountStatus({ email: "user@wazap.invalid" });
      expect(res2.status).toBe("deleted");
    });
  });

  describe("computeUsageVsLimits (UX-1 step 1: shared link pool)", () => {
    it("compares pool usage against Solo limits; ad links not available", () => {
      const res = computeUsageVsLimits("basic", {
        rotators: 2,
        maxSalespeople: 3,
        shortLinks: 1,
        adLinks: 0,
      });
      expect(res.links).toEqual({ current: 3, limit: 20, label: "3 of 20" });
      expect(res.maxSalespeoplePerRotator).toEqual({ current: 3, limit: 10, label: "3 of 10" });
      expect(res.adLinksAvailable).toEqual({ available: false, label: "Not available on this plan" });
      expect(res.widget.available).toBe(true);
    });

    it("compares pool usage against Agency limits; ad links available", () => {
      const res = computeUsageVsLimits("ultimate", {
        rotators: 5,
        maxSalespeople: 12,
        shortLinks: 8,
        adLinks: 3,
      });
      expect(res.links).toEqual({ current: 16, limit: 200, label: "16 of 200" });
      expect(res.maxSalespeoplePerRotator).toEqual({ current: 12, limit: 100, label: "12 of 100" });
      expect(res.adLinksAvailable).toEqual({ available: true, label: "Available" });
      expect(res.widget.available).toBe(true);
    });

    it("compares usage against free (expired/no trial) limits", () => {
      const res = computeUsageVsLimits("free", {
        rotators: 1,
        maxSalespeople: 1,
        shortLinks: 1,
        adLinks: 0,
      });
      expect(res.links.limit).toBe(0);
      expect(res.adLinksAvailable.available).toBe(false);
      // Owner decision: the website button is free and unlimited on every
      // plan, including free - see lib/plan-limits.ts WIDGET_AVAILABLE.
      expect(res.widget.available).toBe(true);
    });
  });

  describe("areCustomerLinksPaused", () => {
    it("reports paused for free account without active trial", () => {
      expect(areCustomerLinksPaused({ plan: "free", trialEndsAt: null })).toBe(true);
    });

    it("reports not paused during active trial", () => {
      const future = new Date(Date.now() + 2 * 86_400_000);
      expect(areCustomerLinksPaused({ plan: "free", trialEndsAt: future })).toBe(false);
    });

    it("reports not paused on active paid plan", () => {
      const future = new Date(Date.now() + 15 * 86_400_000);
      expect(areCustomerLinksPaused({ plan: "pro", planExpiresAt: future })).toBe(false);
    });

    it("reports paused on expired paid plan", () => {
      const past = new Date(Date.now() - 2 * 86_400_000);
      expect(areCustomerLinksPaused({ plan: "pro", planExpiresAt: past })).toBe(true);
    });
  });

  describe("customerDaysRemaining", () => {
    it("computes remaining trial days", () => {
      const future = new Date(Date.now() + 2 * 86_400_000);
      const res = customerDaysRemaining({ plan: "free", trialEndsAt: future });
      expect(res.trialDays).toBeGreaterThanOrEqual(1);
      expect(res.paidDays).toBeNull();
    });

    it("computes remaining paid plan days", () => {
      const future = new Date(Date.now() + 20 * 86_400_000);
      const res = customerDaysRemaining({ plan: "ultimate", planExpiresAt: future });
      expect(res.paidDays).toBeGreaterThanOrEqual(19);
      expect(res.trialDays).toBeNull();
    });
  });
});

describe("customerPlanLabel", () => {
  const future = new Date(Date.now() + 2 * 86_400_000);
  const past = new Date(Date.now() - 2 * 86_400_000);
  it("says which kind of 'free' a customer is", () => {
    expect(customerPlanLabel({ plan: "free", trialEndsAt: future })).toBe("Free trial");
    expect(customerPlanLabel({ plan: "free", trialEndsAt: past })).toBe("Trial ended");
    expect(customerPlanLabel({ plan: "free", trialEndsAt: null })).toBe("Trial ended");
    expect(customerPlanLabel({ plan: "pro", planExpiresAt: past })).toBe("Expired");
    expect(customerPlanLabel({ plan: "pro", planExpiresAt: future })).toBe("Growth");
    expect(customerPlanLabel({ plan: "ultimate", planExpiresAt: future })).toBe("Agency");
  });
});

describe("customerSegmentKey", () => {
  const future = new Date(Date.now() + 2 * 86_400_000);
  const past = new Date(Date.now() - 2 * 86_400_000);
  it("classifies each account into exactly one segment, matching customerPlanLabel", () => {
    expect(customerSegmentKey({ plan: "free", trialEndsAt: future })).toBe("trial");
    expect(customerSegmentKey({ plan: "free", trialEndsAt: past })).toBe("trial_ended");
    expect(customerSegmentKey({ plan: "free", trialEndsAt: null })).toBe("trial_ended");
    expect(customerSegmentKey({ plan: "pro", planExpiresAt: past })).toBe("expired");
    expect(customerSegmentKey({ plan: "pro", planExpiresAt: future })).toBe("paying");
    expect(customerSegmentKey({ plan: "ultimate", planExpiresAt: future })).toBe("paying");
  });
});

describe("customerPlanPill", () => {
  const future = new Date(Date.now() + 2 * 86_400_000);
  const past = new Date(Date.now() - 2 * 86_400_000);
  it("free trial: green pill with the trial end date", () => {
    const pill = customerPlanPill({ plan: "free", trialEndsAt: future });
    expect(pill.label).toBe("Free trial");
    expect(pill.tone).toBe("green");
    expect(pill.sub).toMatch(/^until /);
  });
  it("trial ended: slate pill, no subtext", () => {
    expect(customerPlanPill({ plan: "free", trialEndsAt: null })).toEqual({ label: "Trial ended", tone: "slate", sub: null });
  });
  it("expired paid plan: red pill with 'ended'", () => {
    const pill = customerPlanPill({ plan: "pro", planExpiresAt: past });
    expect(pill.label).toBe("Expired");
    expect(pill.tone).toBe("red");
    expect(pill.sub).toMatch(/^ended /);
  });
  it("paying: plan name pill with 'until', tone varies by tier", () => {
    expect(customerPlanPill({ plan: "basic", planExpiresAt: future })).toMatchObject({ label: "Solo", tone: "sky" });
    expect(customerPlanPill({ plan: "pro", planExpiresAt: future })).toMatchObject({ label: "Growth", tone: "emerald" });
    expect(customerPlanPill({ plan: "ultimate", planExpiresAt: future })).toMatchObject({ label: "Agency", tone: "gold" });
  });
});

describe("accountStatusPill", () => {
  it("no pill for an active account", () => {
    expect(accountStatusPill({ status: "active", scheduledFor: null, requestedAt: null })).toBeNull();
  });
  it("amber pill for a closing account", () => {
    const scheduledFor = new Date("2026-11-13T00:00:00Z");
    const pill = accountStatusPill({ status: "closing", scheduledFor, requestedAt: null });
    expect(pill?.tone).toBe("amber");
    expect(pill?.label).toContain("Closing");
  });
  it("red pill for a deleted account", () => {
    expect(accountStatusPill({ status: "deleted", scheduledFor: null, requestedAt: null })).toEqual({ label: "Deleted", tone: "red" });
  });
});
