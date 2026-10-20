import { normalizePlanKey, LINK_LIMITS, NUMBERS_PER_ROTATOR_LIMITS, AD_LINKS_AVAILABLE, WIDGET_AVAILABLE } from "./plan-limits";
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

// UX-1 step 1: rotators/short links/ad links share one pool - admin screens
// show pool usage (any mix of the three) plus whether ad links are even
// offered on this plan, rather than three separate counts.
export type UsageLimitsComparison = {
  links: { current: number; limit: number; label: string };
  maxSalespeoplePerRotator: { current: number; limit: number; label: string };
  adLinksAvailable: { available: boolean; label: string };
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
  const linkCount = counts.rotators + counts.shortLinks + counts.adLinks;
  const linkCap = LINK_LIMITS[key];
  const numLimit = NUMBERS_PER_ROTATOR_LIMITS[key];
  const adOk = AD_LINKS_AVAILABLE[key];
  const widgetOk = WIDGET_AVAILABLE[key];

  return {
    links: {
      current: linkCount,
      limit: linkCap,
      label: `${linkCount} of ${linkCap}`,
    },
    maxSalespeoplePerRotator: {
      current: counts.maxSalespeople,
      limit: numLimit,
      label: `${counts.maxSalespeople} of ${numLimit}`,
    },
    adLinksAvailable: {
      available: adOk,
      label: adOk ? "Available" : "Not available on this plan",
    },
    // Owner decision: the website button is free and unlimited on every
    // plan, including free - widgetOk is always true (see
    // lib/plan-limits.ts WIDGET_AVAILABLE), kept as a lookup for symmetry
    // with the other rows here.
    widget: {
      available: widgetOk,
      label: "Free for every plan",
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
