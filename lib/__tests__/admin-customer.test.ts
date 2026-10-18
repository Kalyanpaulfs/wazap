import { describe, expect, it } from "vitest";
import {
  getCustomerAccountStatus,
  computeUsageVsLimits,
  areCustomerLinksPaused,
  customerDaysRemaining,
  customerPlanLabel,
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

  describe("computeUsageVsLimits", () => {
    it("compares usage against Solo limits", () => {
      const res = computeUsageVsLimits("basic", {
        rotators: 2,
        maxSalespeople: 3,
        shortLinks: 1,
        adLinks: 0,
      });
      expect(res.rotators).toEqual({ current: 2, limit: 3, label: "2 of 3" });
      expect(res.maxSalespeoplePerRotator).toEqual({ current: 3, limit: 3, label: "3 of 3" });
      expect(res.shortLinks).toEqual({ current: 1, limit: 2, label: "1 of 2" });
      expect(res.adLinks).toEqual({ current: 0, limit: 0, label: "0 of 0" });
      expect(res.widget.available).toBe(true);
    });

    it("compares usage against Agency limits", () => {
      const res = computeUsageVsLimits("ultimate", {
        rotators: 5,
        maxSalespeople: 12,
        shortLinks: 8,
        adLinks: 3,
      });
      expect(res.rotators).toEqual({ current: 5, limit: 25, label: "5 of 25" });
      expect(res.maxSalespeoplePerRotator).toEqual({ current: 12, limit: 20, label: "12 of 20" });
      expect(res.shortLinks).toEqual({ current: 8, limit: 15, label: "8 of 15" });
      expect(res.adLinks).toEqual({ current: 3, limit: 15, label: "3 of 15" });
      expect(res.widget.available).toBe(true);
    });

    it("compares usage against free (expired/no trial) limits", () => {
      const res = computeUsageVsLimits("free", {
        rotators: 1,
        maxSalespeople: 1,
        shortLinks: 1,
        adLinks: 0,
      });
      expect(res.rotators.limit).toBe(0);
      expect(res.widget.available).toBe(false);
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
