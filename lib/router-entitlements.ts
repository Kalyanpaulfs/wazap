import type { PlanEntitlementUser } from "./entitlements";
import { isProductTrialActive, PRODUCT_TRIAL_PLAN } from "./entitlements";
import { isPlanExpired } from "./billing";

// Owner rule (100-lead trial cap, FEAT-TRIAL-100-LEADS): routed leads are
// UNLIMITED on every paid plan, capped at TRIAL_ROUTED_LEADS during an
// active Free trial (no paid plan), and ZERO (blocked, no routing at all)
// for anyone on plan "free" with no active trial. There is no lifetime free
// allowance any more - just the trial cap and the paid/free plan check.
export const ROUTER_METERING_LAUNCHED_AT = new Date("2026-10-05T20:00:00.000Z");

// Routed leads allowed during the one-time 3-day Free trial (no paid plan).
// Paid plans (Solo/Growth/Agency) stay unlimited - see routerQuota below.
export const TRIAL_ROUTED_LEADS = 100;
// In the past as of this restructure — hasLegacyRouterGrace is always false
// now and is effectively inert. Kept (harmless) rather than deleted.
export const EXISTING_ROUTER_GRACE_END = new Date("2026-10-12T20:00:00.000Z");

// Columns every click-time check needs to decide whether a public link
// (rotator /r/, short link /w/, ad link /a/) may route — see app/r/[code],
// app/w/[code] and app/a/[id].
export const OWNER_ENTITLEMENT_SELECT = {
  plan: true,
  planExpiresAt: true,
  trialPlan: true,
  trialEndsAt: true,
  createdAt: true,
} as const;

type RouterEntitlementUser = PlanEntitlementUser & {
  createdAt?: Date | string | null;
  planExpiresAt?: Date | string | null;
};

// Plan used for EVERYTHING link-related: how many rotators/short links/ad
// links a user may have, numbers per rotator, and whether public links
// route at all. Expiry-aware paid plan wins; otherwise Solo ("basic")
// during an active Free trial (the trial is exactly Solo's features — the
// stored trialPlan is ignored, same as lib/entitlements.ts effectivePlan);
// otherwise "free" (no paid plan, no active trial — everything stopped).
export function linkPlan(user: RouterEntitlementUser | null | undefined, now = new Date()): string {
  if (!user) return "free";
  const expiry = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
  const rawPlan = (user.plan ?? "free").toLowerCase();
  if (!isPlanExpired(rawPlan, expiry) && rawPlan !== "free") {
    return rawPlan === "business" ? "ultimate" : rawPlan;
  }
  return isProductTrialActive(user, now) ? PRODUCT_TRIAL_PLAN : "free";
}

// Owner rule: lead routing honours the Free trial exactly like the
// link/count limits do for WHICH plan applies — an active trial resolves to
// Solo ("basic"), same as linkPlan. routerQuota below is what actually caps
// the trial at TRIAL_ROUTED_LEADS; paid Solo (a real, unexpired paid plan)
// stays unlimited even though it resolves to the same plan string.
export function routerPlan(user: RouterEntitlementUser | null | undefined, now = new Date()): string {
  return linkPlan(user, now);
}

// True when the user has a real, unexpired PAID plan (not a Free trial).
// Needed because routerPlan/linkPlan resolve an active trial to "basic" too
// (same as a paying Solo customer) - routerQuota uses this to tell "paid
// Solo: unlimited" apart from "trial currently at Solo's limits: capped at
// TRIAL_ROUTED_LEADS".
function isPaidPlanActive(user: RouterEntitlementUser | null | undefined, now = new Date()): boolean {
  if (!user) return false;
  const expiry = user.planExpiresAt ? new Date(user.planExpiresAt) : null;
  const rawPlan = (user.plan ?? "free").toLowerCase();
  return !isPlanExpired(rawPlan, expiry) && rawPlan !== "free";
}

// True when the owner's public links (rotator, short link, ad link) may
// route at all. Use this at CLICK TIME in the public routes (app/r,
// app/w, app/a) — it reflects live plan/trial state, not just the cached
// planPausedAt flag, so a free/no-trial user's link stops routing
// immediately even before a pause-sync cron has run.
export function canRouteLinks(user: RouterEntitlementUser | null | undefined, now = new Date()): boolean {
  return linkPlan(user, now) !== "free";
}

export function hasLegacyRouterGrace(user: RouterEntitlementUser | null | undefined, now = new Date()) {
  if (!user?.createdAt) return false;
  return new Date(user.createdAt) < ROUTER_METERING_LAUNCHED_AT && now < EXISTING_ROUTER_GRACE_END;
}

export function routerQuota(user: RouterEntitlementUser | null | undefined, used: number, now = new Date()) {
  const plan = routerPlan(user, now);

  // Paid plan (real, unexpired Solo/Growth/Agency): unlimited, same as always.
  if (isPaidPlanActive(user, now)) {
    return { plan, limit: null, used, remaining: null, allowed: true, grace: false, graceEndsAt: null };
  }

  // Active Free trial (no paid plan): Solo's other limits, capped at
  // TRIAL_ROUTED_LEADS routed leads for the life of the trial.
  if (isProductTrialActive(user, now)) {
    const limit = TRIAL_ROUTED_LEADS;
    const allowed = used < limit;
    return { plan, limit, used, remaining: Math.max(0, limit - used), allowed, grace: false, graceEndsAt: null };
  }

  // Free / no active trial: blocked entirely, except the (now-inert) legacy grace window.
  const grace = hasLegacyRouterGrace(user, now);
  return {
    plan,
    limit: grace ? null : 0,
    used,
    remaining: grace ? null : 0,
    allowed: grace,
    grace,
    graceEndsAt: grace ? EXISTING_ROUTER_GRACE_END.toISOString() : null,
  };
}
