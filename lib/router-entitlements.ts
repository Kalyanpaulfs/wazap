import type { PlanEntitlementUser } from "./entitlements";
import { isProductTrialActive, PRODUCT_TRIAL_PLAN } from "./entitlements";
import { isPlanExpired } from "./billing";

export const FREE_ROUTED_LEADS_LIFETIME = 25;
// Owner decision (16 Oct): while a product trial is active, the lifetime
// routed-lead cap is raised to 100 (instead of the free 25). After the trial
// the free 25 applies again, counted over the same lifetime total.
export const TRIAL_ROUTED_LEADS_LIFETIME = 100;
export const ROUTER_METERING_LAUNCHED_AT = new Date("2026-10-05T20:00:00.000Z");
export const EXISTING_ROUTER_GRACE_END = new Date("2026-10-12T20:00:00.000Z");

type RouterEntitlementUser = PlanEntitlementUser & {
  createdAt?: Date | string | null;
  planExpiresAt?: Date | string | null;
};

export function routerPlan(user: RouterEntitlementUser | null | undefined) {
  if (!user) return "free";
  const expiry = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
  // Lead routing is Wazap's paid core. Product trials can unlock supporting
  // tools, but do not turn a public routing link into an unlimited free link.
  const plan = isPlanExpired(user.plan ?? "free", expiry) ? "free" : (user.plan ?? "free").toLowerCase();
  return plan === "business" ? "ultimate" : plan;
}

// Owner decision (FEAT-AUDIT-HARDENING trial links): unlike routerPlan (paid
// only, no trial boost - lead-routing stays metered through a trial), the
// rotator/short-link/ad-link COUNT limits (how many of each a user may have,
// and numbers-per-rotator) give a free user the full Growth (pro) link
// limits for the duration of an active product trial. Same expiry-aware
// paid-plan check as routerPlan; falls back to the trial plan only when the
// stored plan is free (or expired back to free) and the trial is active,
// otherwise free.
export function linkPlan(user: RouterEntitlementUser | null | undefined, now = new Date()): string {
  if (!user) return "free";
  const expiry = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
  const rawPlan = (user.plan ?? "free").toLowerCase();
  if (!isPlanExpired(rawPlan, expiry) && rawPlan !== "free") {
    return rawPlan === "business" ? "ultimate" : rawPlan;
  }
  return isProductTrialActive(user, now) ? (user.trialPlan ?? PRODUCT_TRIAL_PLAN).toLowerCase() : "free";
}

export function hasLegacyRouterGrace(user: RouterEntitlementUser | null | undefined, now = new Date()) {
  if (!user?.createdAt) return false;
  return new Date(user.createdAt) < ROUTER_METERING_LAUNCHED_AT && now < EXISTING_ROUTER_GRACE_END;
}

export function routerQuota(user: RouterEntitlementUser | null | undefined, used: number, now = new Date()) {
  const plan = routerPlan(user);
  const paid = plan !== "free";
  const grace = !paid && hasLegacyRouterGrace(user, now);
  const cap = !paid && isProductTrialActive(user, now) ? TRIAL_ROUTED_LEADS_LIFETIME : FREE_ROUTED_LEADS_LIFETIME;
  return {
    plan,
    limit: paid || grace ? null : cap,
    used,
    remaining: paid || grace ? null : Math.max(0, cap - used),
    allowed: paid || grace || used < cap,
    grace,
    graceEndsAt: grace ? EXISTING_ROUTER_GRACE_END.toISOString() : null,
  };
}
