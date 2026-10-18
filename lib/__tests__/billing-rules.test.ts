import { describe, expect, it } from "vitest";
import { PLAN_RANK, REFUND_WINDOW_HOURS, canRefund, classifyIncomingCharge, decideAccessAfterRefund, decidePlanChange } from "@/lib/billing-rules";
import { PLAN_NAMES, planDisplayName } from "@/lib/billing";

describe("PLAN_NAMES & planDisplayName", () => {
  it("maps plans to their canonical display names per rule 7", () => {
    expect(PLAN_NAMES.free).toBe("Free trial");
    expect(PLAN_NAMES.basic).toBe("Solo");
    expect(PLAN_NAMES.pro).toBe("Growth");
    expect(PLAN_NAMES.ultimate).toBe("Agency");
    expect(PLAN_NAMES.business).toBe("Business (old plan)");
  });

  it("planDisplayName formats known and unknown plans properly", () => {
    expect(planDisplayName("free")).toBe("Free trial");
    expect(planDisplayName("basic")).toBe("Solo");
    expect(planDisplayName("pro")).toBe("Growth");
    expect(planDisplayName("ultimate")).toBe("Agency");
    expect(planDisplayName("business")).toBe("Business (old plan)");
    expect(planDisplayName(null)).toBe("Free trial");
    expect(planDisplayName("custom_plan")).toBe("Custom_plan");
  });
});

describe("PLAN_RANK", () => {
  it("orders plans free < basic < pro < ultimate < business", () => {
    expect(PLAN_RANK.free).toBeLessThan(PLAN_RANK.basic);
    expect(PLAN_RANK.basic).toBeLessThan(PLAN_RANK.pro);
    expect(PLAN_RANK.pro).toBeLessThan(PLAN_RANK.ultimate);
    expect(PLAN_RANK.ultimate).toBeLessThan(PLAN_RANK.business);
  });
});

describe("decidePlanChange", () => {
  it("returns invalid for an unknown target plan", () => {
    expect(
      decidePlanChange({ currentPlan: "basic", accessActive: true, hasLiveSubscription: true, autoRenew: true, targetPlan: "enterprise" }),
    ).toBe("invalid");
  });

  it("returns invalid when the target plan is free", () => {
    expect(
      decidePlanChange({ currentPlan: "basic", accessActive: true, hasLiveSubscription: true, autoRenew: true, targetPlan: "free" }),
    ).toBe("invalid");
  });

  it("returns checkout when there is no live subscription", () => {
    expect(
      decidePlanChange({ currentPlan: "free", accessActive: false, hasLiveSubscription: false, autoRenew: false, targetPlan: "basic" }),
    ).toBe("checkout");
  });

  it("returns checkout when access has lapsed even with a live subscription record", () => {
    expect(
      decidePlanChange({ currentPlan: "basic", accessActive: false, hasLiveSubscription: true, autoRenew: true, targetPlan: "pro" }),
    ).toBe("checkout");
  });

  it("returns upgrade when the target plan outranks the current plan", () => {
    expect(
      decidePlanChange({ currentPlan: "basic", accessActive: true, hasLiveSubscription: true, autoRenew: true, targetPlan: "pro" }),
    ).toBe("upgrade");
  });

  it("returns downgrade when the target plan is ranked lower", () => {
    expect(
      decidePlanChange({ currentPlan: "ultimate", accessActive: true, hasLiveSubscription: true, autoRenew: true, targetPlan: "basic" }),
    ).toBe("downgrade");
  });

  it("returns blocked_autorenew for the same plan while auto-renew is on", () => {
    expect(
      decidePlanChange({ currentPlan: "pro", accessActive: true, hasLiveSubscription: true, autoRenew: true, targetPlan: "pro" }),
    ).toBe("blocked_autorenew");
  });

  it("returns renew for the same plan when auto-renew is off", () => {
    expect(
      decidePlanChange({ currentPlan: "pro", accessActive: true, hasLiveSubscription: true, autoRenew: false, targetPlan: "pro" }),
    ).toBe("renew");
  });
});

describe("canRefund", () => {
  const baseNow = new Date("2026-10-14T12:00:00.000Z");

  it("allows a refund well inside the 48h window", () => {
    const result = canRefund({
      paymentCreatedAt: new Date("2026-10-14T00:00:00.000Z"),
      status: "active",
      method: "paypal",
      alreadyRefunded: false,
      now: baseNow,
    });
    expect(result).toEqual({ ok: true, reason: "ok" });
  });

  it("allows a refund at exactly the 48h boundary", () => {
    const paymentCreatedAt = new Date(baseNow.getTime() - REFUND_WINDOW_HOURS * 3_600_000);
    const result = canRefund({ paymentCreatedAt, status: "active", method: "dodo", alreadyRefunded: false, now: baseNow });
    expect(result.ok).toBe(true);
  });

  it("blocks a refund one millisecond past the 48h boundary", () => {
    const paymentCreatedAt = new Date(baseNow.getTime() - REFUND_WINDOW_HOURS * 3_600_000 - 1);
    const result = canRefund({ paymentCreatedAt, status: "active", method: "dodo", alreadyRefunded: false, now: baseNow });
    expect(result).toEqual({ ok: false, reason: "window_closed" });
  });

  it("blocks an unsupported payment method", () => {
    const result = canRefund({ paymentCreatedAt: baseNow, status: "active", method: "paypal_invoice", alreadyRefunded: false, now: baseNow });
    expect(result).toEqual({ ok: false, reason: "unsupported_method" });
  });

  it("blocks a payment that is not active", () => {
    const result = canRefund({ paymentCreatedAt: baseNow, status: "charged_back", method: "paypal", alreadyRefunded: false, now: baseNow });
    expect(result).toEqual({ ok: false, reason: "not_active" });
  });

  it("blocks a payment that was already refunded", () => {
    const result = canRefund({ paymentCreatedAt: baseNow, status: "active", method: "paypal", alreadyRefunded: true, now: baseNow });
    expect(result).toEqual({ ok: false, reason: "already_refunded" });
  });
});

describe("classifyIncomingCharge", () => {
  it("returns first when there is no live pointer", () => {
    const result = classifyIncomingCharge({ pointerSubscriptionId: null, pointerLive: false, incomingSubscriptionId: "sub_1", pendingChange: null });
    expect(result).toBe("first");
  });

  it("returns first when the pointer exists but is not live", () => {
    const result = classifyIncomingCharge({ pointerSubscriptionId: "sub_0", pointerLive: false, incomingSubscriptionId: "sub_1", pendingChange: null });
    expect(result).toBe("first");
  });

  it("returns same when the charge matches the current live pointer", () => {
    const result = classifyIncomingCharge({ pointerSubscriptionId: "sub_0", pointerLive: true, incomingSubscriptionId: "sub_0", pendingChange: null });
    expect(result).toBe("same");
  });

  it("returns expected_change when the charge matches a pending plan change's new subscription", () => {
    const result = classifyIncomingCharge({
      pointerSubscriptionId: "sub_0",
      pointerLive: true,
      incomingSubscriptionId: "sub_1",
      pendingChange: { newSubscriptionId: "sub_1", oldSubscriptionId: "sub_0" },
    });
    expect(result).toBe("expected_change");
  });

  it("returns duplicate when the charge is from an unrelated subscription", () => {
    const result = classifyIncomingCharge({
      pointerSubscriptionId: "sub_0",
      pointerLive: true,
      incomingSubscriptionId: "sub_2",
      pendingChange: { newSubscriptionId: "sub_1", oldSubscriptionId: "sub_0" },
    });
    expect(result).toBe("duplicate");
  });

  it("returns duplicate when there is no pending change at all", () => {
    const result = classifyIncomingCharge({ pointerSubscriptionId: "sub_0", pointerLive: true, incomingSubscriptionId: "sub_2", pendingChange: null });
    expect(result).toBe("duplicate");
  });
});

describe("decideAccessAfterRefund", () => {
  it("ends access when the refunded subscription is the current pointer", () => {
    const result = decideAccessAfterRefund({ refundedSubscriptionId: "sub_0", pointerSubscriptionId: "sub_0", pointerLive: true });
    expect(result).toBe(true);
  });

  it("ends access when there is no current pointer", () => {
    const result = decideAccessAfterRefund({ refundedSubscriptionId: "sub_0", pointerSubscriptionId: null, pointerLive: false });
    expect(result).toBe(true);
  });

  it("ends access when the refunded subscription is unknown", () => {
    const result = decideAccessAfterRefund({ refundedSubscriptionId: null, pointerSubscriptionId: "sub_0", pointerLive: true });
    expect(result).toBe(true);
  });

  it("keeps access when another live subscription already covers the user", () => {
    const result = decideAccessAfterRefund({ refundedSubscriptionId: "sub_0", pointerSubscriptionId: "sub_1", pointerLive: true });
    expect(result).toBe(false);
  });

  it("ends access when the pointer differs but is not actually live", () => {
    const result = decideAccessAfterRefund({ refundedSubscriptionId: "sub_0", pointerSubscriptionId: "sub_1", pointerLive: false });
    expect(result).toBe(true);
  });
});

describe("decideAccessAfterRefund: older month refunded", () => {
  it("keeps access when a newer paid charge exists", () => {
    expect(decideAccessAfterRefund({ refundedSubscriptionId: "S0", pointerSubscriptionId: "S0", pointerLive: true, newerChargeExists: true })).toBe(false);
  });
});

describe("classifyIncomingCharge: pending change wins", () => {
  const upgrade = { newSubscriptionId: "S1", oldSubscriptionId: "S0", toPlan: "pro" };
  it("completes an upgrade even when ACTIVATED already moved the pointer to the new subscription", () => {
    expect(classifyIncomingCharge({ pointerSubscriptionId: "S1", pointerLive: true, incomingSubscriptionId: "S1", incomingPlan: "pro", pendingChange: upgrade })).toBe("expected_change");
  });
  it("completes a scheduled downgrade whose old subscription is already cancelled", () => {
    const downgrade = { newSubscriptionId: "S1", oldSubscriptionId: "S0", toPlan: "basic" };
    expect(classifyIncomingCharge({ pointerSubscriptionId: "S0", pointerLive: false, incomingSubscriptionId: "S1", incomingPlan: "basic", pendingChange: downgrade })).toBe("expected_change");
  });
  it("Dodo in-place change: same subscription, only when the plan matches", () => {
    const dodo = { newSubscriptionId: "S0", oldSubscriptionId: "S0", toPlan: "basic" };
    expect(classifyIncomingCharge({ pointerSubscriptionId: "S0", pointerLive: true, incomingSubscriptionId: "S0", incomingPlan: "basic", pendingChange: dodo })).toBe("expected_change");
    expect(classifyIncomingCharge({ pointerSubscriptionId: "S0", pointerLive: true, incomingSubscriptionId: "S0", incomingPlan: "pro", pendingChange: dodo })).toBe("same");
  });
});

describe("decideAccessAfterRefund: plan no longer matches", () => {
  it("keeps access when the user is no longer on the refunded payment's plan", () => {
    expect(decideAccessAfterRefund({ refundedSubscriptionId: null, pointerSubscriptionId: null, pointerLive: false, planMatches: false })).toBe(false);
  });
});
