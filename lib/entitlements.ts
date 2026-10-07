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
