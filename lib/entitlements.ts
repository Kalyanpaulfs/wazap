import { isPlanExpired } from "./billing";

export const PRODUCT_TRIAL_DAYS = 14;
export const PRODUCT_TRIAL_PLAN = "pro";

export type PlanEntitlementUser = {
  plan?: string | null;
  trialPlan?: string | null;
  trialEndsAt?: Date | string | null;
};

export function isProductTrialActive(user: PlanEntitlementUser | null | undefined, now = new Date()) {
  if (!user || (user.plan ?? "free").toLowerCase() !== "free" || !user.trialEndsAt) return false;
  return new Date(user.trialEndsAt).getTime() > now.getTime();
}

export function effectivePlan(user: PlanEntitlementUser | null | undefined, now = new Date()) {
  const paidPlan = (user?.plan ?? "free").toLowerCase();
  if (paidPlan !== "free") return paidPlan;
  return isProductTrialActive(user, now) ? (user?.trialPlan ?? PRODUCT_TRIAL_PLAN).toLowerCase() : "free";
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
