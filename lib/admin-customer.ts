import { normalizePlanKey, ROTATOR_LIMITS, NUMBERS_PER_ROTATOR_LIMITS, SHORT_LINK_LIMITS, AD_LINK_LIMITS, WIDGET_AVAILABLE } from "./plan-limits";
import { isProductTrialActive, trialDaysLeft } from "./entitlements";
import { isPlanExpired, getPlanDaysLeft, PLAN_NAMES } from "./billing";

// Bold plan label for admin screens. "free" alone is ambiguous: it is a running
// trial, an ended trial or a paid plan that lapsed, so say which.
export function customerPlanLabel(user: {
  plan?: string | null;
  planExpiresAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): string {
  if (isProductTrialActive(user)) return "Free trial";
  const plan = (user.plan ?? "free").toLowerCase();
  if (plan === "free") return "Trial ended";
  if (isPlanExpired(plan, user.planExpiresAt ? new Date(user.planExpiresAt) : null)) return "Expired";
  return PLAN_NAMES[plan] || plan;
}

export type CustomerAccountStatus = "active" | "closing" | "deleted";

export type CustomerLifecycleInfo = {
  status: CustomerAccountStatus;
  scheduledFor: Date | null;
  requestedAt: Date | null;
};

export function getCustomerAccountStatus(user: {
  email: string;
  accountDeletionScheduledFor?: Date | string | null;
  accountDeletionRequestedAt?: Date | string | null;
}): CustomerLifecycleInfo {
  if (user.email.startsWith("deleted+") || user.email.endsWith("@wazap.invalid")) {
    return { status: "deleted", scheduledFor: null, requestedAt: null };
  }
  if (user.accountDeletionScheduledFor) {
    const scheduled = new Date(user.accountDeletionScheduledFor);
    return {
      status: "closing",
      scheduledFor: scheduled,
      requestedAt: user.accountDeletionRequestedAt ? new Date(user.accountDeletionRequestedAt) : null,
    };
  }
  return { status: "active", scheduledFor: null, requestedAt: null };
}

export type UsageLimitsComparison = {
  rotators: { current: number; limit: number; label: string };
  maxSalespeoplePerRotator: { current: number; limit: number; label: string };
  shortLinks: { current: number; limit: number; label: string };
  adLinks: { current: number; limit: number; label: string };
  widget: { available: boolean; label: string };
};

export function computeUsageVsLimits(
  plan: string | null | undefined,
  counts: {
    rotators: number;
    maxSalespeople: number;
    shortLinks: number;
    adLinks: number;
  }
): UsageLimitsComparison {
  const key = normalizePlanKey(plan);
  const rotLimit = ROTATOR_LIMITS[key];
  const numLimit = NUMBERS_PER_ROTATOR_LIMITS[key];
  const shortLimit = SHORT_LINK_LIMITS[key];
  const adLimit = AD_LINK_LIMITS[key];
  const widgetOk = WIDGET_AVAILABLE[key];

  return {
    rotators: {
      current: counts.rotators,
      limit: rotLimit,
      label: `${counts.rotators} of ${rotLimit}`,
    },
    maxSalespeoplePerRotator: {
      current: counts.maxSalespeople,
      limit: numLimit,
      label: `${counts.maxSalespeople} of ${numLimit}`,
    },
    shortLinks: {
      current: counts.shortLinks,
      limit: shortLimit,
      label: `${counts.shortLinks} of ${shortLimit}`,
    },
    adLinks: {
      current: counts.adLinks,
      limit: adLimit,
      label: `${counts.adLinks} of ${adLimit}`,
    },
    widget: {
      available: widgetOk,
      label: widgetOk ? "Included in plan" : "Not included in free plan",
    },
  };
}

export function areCustomerLinksPaused(user: {
  plan?: string | null;
  planExpiresAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): boolean {
  const plan = (user.plan ?? "free").toLowerCase();
  const trial = isProductTrialActive(user);
  if (plan === "free") return !trial;
  return isPlanExpired(plan, user.planExpiresAt ? new Date(user.planExpiresAt) : null);
}

export function customerDaysRemaining(user: {
  plan?: string | null;
  planExpiresAt?: Date | string | null;
  trialEndsAt?: Date | string | null;
}): { trialDays: number | null; paidDays: number | null } {
  const trial = isProductTrialActive(user);
  const trialDays = trial ? trialDaysLeft(user) : null;
  const paidDays = user.plan !== "free" && user.planExpiresAt ? getPlanDaysLeft(new Date(user.planExpiresAt)) : null;
  return { trialDays, paidDays };
}
