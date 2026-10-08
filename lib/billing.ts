export const PAID_PLAN_DAYS = 30;

export const PLAN_PRICES: Record<string, number> = {
  basic: 9,
  pro: 19,
  ultimate: 49,
  business: 149,
};

export function planExpiry(plan: string) {
  if (!["basic", "pro", "ultimate", "business"].includes(plan)) return null;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + PAID_PLAN_DAYS);
  return expiry;
}

export function extendPlanExpiry(plan: string, currentExpiresAt: Date | null | undefined) {
  if (!["basic", "pro", "ultimate", "business"].includes(plan)) return null;
  const base =
    currentExpiresAt && currentExpiresAt.getTime() > Date.now()
      ? new Date(currentExpiresAt)
      : new Date();
  base.setDate(base.getDate() + PAID_PLAN_DAYS);
  return base;
}

export function getPlanDaysLeft(expiresAt: Date | null | undefined) {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86_400_000));
}

export function isPlanExpired(plan: string, expiresAt: Date | null | undefined) {
  return plan !== "free" && !!expiresAt && expiresAt <= new Date();
}

export function planPrice(plan: string) {
  return PLAN_PRICES[plan.toLowerCase()] ?? 0;
}
