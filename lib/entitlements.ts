import { isPlanExpired } from "./billing";
import { normalizePlanKey, PLAN_DISPLAY_NAME } from "./plan-limits";

export const PRODUCT_TRIAL_DAYS = 3;
export const PRODUCT_TRIAL_PLAN = "basic";

export type PlanEntitlementUser = {
  plan?: string | null;
  trialPlan?: string | null;
  trialEndsAt?: Date | string | null;
};

export function isProductTrialActive(user: PlanEntitlementUser | null | undefined, now = new Date()) {
  if (!user || (user.plan ?? "free").toLowerCase() !== "free" || !user.trialEndsAt) return false;
  return new Date(user.trialEndsAt).getTime() > now.getTime();
}

// Owner rule (Free-trial restructure): the Free trial is EXACTLY Solo, so
// the stored trialPlan is ignored here — accounts created before this
// restructure can carry trialPlan: "pro" from the old Growth trial, and
// should not get Growth limits for the rest of their trial.
export function effectivePlan(user: PlanEntitlementUser | null | undefined, now = new Date()) {
  const paidPlan = (user?.plan ?? "free").toLowerCase();
  if (paidPlan !== "free") return paidPlan;
  return isProductTrialActive(user, now) ? PRODUCT_TRIAL_PLAN : "free";
}

// Customer-facing plan name. Never returns the bare word "Free" and never
// calls the trial "Solo trial" — it says "Free trial" (active) or
// "Free trial ended" (lapsed or never trialled). Expiry-aware for paid
// plans, like linkPlan in lib/router-entitlements.ts.
export function accountPlanLabel(
  user: (PlanEntitlementUser & { planExpiresAt?: Date | string | null }) | null | undefined,
  now = new Date(),
): string {
  const plan = (user?.plan ?? "free").toLowerCase();
  const expiresAt = user?.planExpiresAt ? new Date(user.planExpiresAt) : null;
  if (plan !== "free" && !isPlanExpired(plan, expiresAt)) return PLAN_DISPLAY_NAME[normalizePlanKey(plan)];
  return isProductTrialActive(user, now) ? "Free trial" : "Free trial ended";
}

export function trialDaysLeft(user: PlanEntitlementUser | null | undefined, now = new Date()) {
  if (!isProductTrialActive(user, now) || !user?.trialEndsAt) return 0;
  return Math.max(1, Math.ceil((new Date(user.trialEndsAt).getTime() - now.getTime()) / 86_400_000));
}

export function newProductTrial(now = new Date()) {
  const endsAt = new Date(now);
  endsAt.setDate(endsAt.getDate() + PRODUCT_TRIAL_DAYS);
  return { trialStartedAt: now, trialEndsAt: endsAt, trialPlan: PRODUCT_TRIAL_PLAN };
}

export type CustomerSegmentUser = PlanEntitlementUser & { planExpiresAt?: Date | string | null };
export type CustomerSegment = "paid" | "trial" | "expired" | "free";

// Mutually exclusive customer classification shared by the CRM overview numbers and the
// broadcast "Send to" groups.
// - paid: a non-free plan that has not expired.
// - trial: on the free plan, inside an active product trial.
// - expired: a non-free plan past its expiry, OR a free-plan trial that ended without the user paying.
// - free: everyone else (never trialled, or free with no trial history).
export function customerSegment(user: CustomerSegmentUser | null | undefined, now = new Date()): CustomerSegment {
  const plan = (user?.plan ?? "free").toLowerCase();
  if (plan !== "free") {
    const expiresAt = user?.planExpiresAt ? new Date(user.planExpiresAt) : null;
    return isPlanExpired(plan, expiresAt) ? "expired" : "paid";
  }
  if (isProductTrialActive(user, now)) return "trial";
  if (user?.trialEndsAt && new Date(user.trialEndsAt).getTime() <= now.getTime()) return "expired";
  return "free";
}
