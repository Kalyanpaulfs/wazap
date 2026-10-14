import { describe, expect, it } from "vitest";
import {
  computeScheduledEffectiveAt,
  isFutureDate,
  isStalePendingChange,
  periodEndFromExpiry,
  PENDING_PLAN_CHANGE_STALE_MS,
} from "@/lib/billing-rules";

describe("periodEndFromExpiry", () => {
  it("returns null when there is no expiry", () => {
    expect(periodEndFromExpiry(null, 3)).toBeNull();
    expect(periodEndFromExpiry(undefined, 3)).toBeNull();
  });

  it("subtracts the grace days from the stored expiry", () => {
    const expiresAt = new Date("2026-11-13T00:00:00.000Z");
    const result = periodEndFromExpiry(expiresAt, 3);
    expect(result?.toISOString()).toBe("2026-11-10T00:00:00.000Z");
  });
});

describe("isFutureDate", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");

  it("is false for null", () => {
    expect(isFutureDate(null, now)).toBe(false);
  });

  it("is false for a date in the past or exactly now", () => {
    expect(isFutureDate(now, now)).toBe(false);
    expect(isFutureDate(new Date(now.getTime() - 1), now)).toBe(false);
  });

  it("is true for a date after now", () => {
    expect(isFutureDate(new Date(now.getTime() + 1), now)).toBe(true);
  });
});

describe("computeScheduledEffectiveAt", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");

  it("prefers the provider's period end when it is in the future", () => {
    const providerPeriodEnd = new Date("2026-11-01T00:00:00.000Z");
    const fallbackPlanExpiresAt = new Date("2026-11-05T00:00:00.000Z");
    const result = computeScheduledEffectiveAt({ providerPeriodEnd, fallbackPlanExpiresAt, graceDays: 3, now });
    expect(result).toEqual(providerPeriodEnd);
  });

  it("falls back to planExpiresAt minus the grace days when the provider gave nothing", () => {
    const fallbackPlanExpiresAt = new Date("2026-11-05T00:00:00.000Z");
    const result = computeScheduledEffectiveAt({ providerPeriodEnd: null, fallbackPlanExpiresAt, graceDays: 3, now });
    expect(result?.toISOString()).toBe(new Date(fallbackPlanExpiresAt.getTime() - 3 * 86_400_000).toISOString());
  });

  it("ignores a provider period end that has already passed and uses the fallback instead", () => {
    const providerPeriodEnd = new Date("2026-10-01T00:00:00.000Z"); // in the past relative to `now`
    const fallbackPlanExpiresAt = new Date("2026-11-05T00:00:00.000Z");
    const result = computeScheduledEffectiveAt({ providerPeriodEnd, fallbackPlanExpiresAt, graceDays: 3, now });
    expect(result?.toISOString()).toBe(new Date(fallbackPlanExpiresAt.getTime() - 3 * 86_400_000).toISOString());
  });

  it("returns null when neither the provider nor the fallback gives a future date", () => {
    const result = computeScheduledEffectiveAt({ providerPeriodEnd: null, fallbackPlanExpiresAt: null, graceDays: 3, now });
    expect(result).toBeNull();
  });

  it("returns null when the fallback, after subtracting grace days, is no longer in the future", () => {
    const fallbackPlanExpiresAt = new Date(now.getTime() + 1 * 86_400_000); // 1 day out
    const result = computeScheduledEffectiveAt({ providerPeriodEnd: null, fallbackPlanExpiresAt, graceDays: 3, now });
    expect(result).toBeNull();
  });
});

describe("isStalePendingChange", () => {
  const now = new Date("2026-10-14T12:00:00.000Z");

  it("is never stale once the new subscription was approved, however old", () => {
    const createdAt = new Date(now.getTime() - 10 * PENDING_PLAN_CHANGE_STALE_MS);
    expect(isStalePendingChange({ createdAt, now, newSubscriptionWasApproved: true })).toBe(false);
  });

  it("is not stale inside the 1 hour window, unapproved", () => {
    const createdAt = new Date(now.getTime() - PENDING_PLAN_CHANGE_STALE_MS + 1_000);
    expect(isStalePendingChange({ createdAt, now, newSubscriptionWasApproved: false })).toBe(false);
  });

  it("is stale just past the 1 hour window, unapproved", () => {
    const createdAt = new Date(now.getTime() - PENDING_PLAN_CHANGE_STALE_MS - 1);
    expect(isStalePendingChange({ createdAt, now, newSubscriptionWasApproved: false })).toBe(true);
  });

  it("is not stale exactly at the 1 hour boundary", () => {
    const createdAt = new Date(now.getTime() - PENDING_PLAN_CHANGE_STALE_MS);
    expect(isStalePendingChange({ createdAt, now, newSubscriptionWasApproved: false })).toBe(false);
  });
});
