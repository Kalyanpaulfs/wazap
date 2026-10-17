import type { PlanEntitlementUser } from "./entitlements";
import { isProductTrialActive, PRODUCT_TRIAL_PLAN } from "./entitlements";
import { isPlanExpired } from "./billing";

// Owner rule (Free-trial restructure, FEAT-FREE-TRIAL): routed leads are
// UNLIMITED on every paid plan and during an active Free trial, and ZERO
// (blocked, no routing at all) for anyone on plan "free" with no active
// trial. The old 25-lifetime-lead free allowance and the 100-lead trial cap
// are gone — there is no lead count to meter any more, just a plan check.
export const ROUTER_METERING_LAUNCHED_AT = new Date("2026-10-05T20:00:00.000Z");
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

// Owner rule (Free-trial restructure): lead routing now honours the Free
// trial exactly like the link/count limits do — an active trial routes
// leads just like Solo (unlimited), and free/no-trial routes none at all.
export function routerPlan(user: RouterEntitlementUser | null | undefined, now = new Date()): string {
  return linkPlan(user, now);
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
  const entitled = plan !== "free";
  const grace = !entitled && hasLegacyRouterGrace(user, now);
  const allowed = entitled || grace;
  return {
    plan,
    limit: allowed ? null : 0,
    used,
    remaining: allowed ? null : 0,
    allowed,
    grace,
    graceEndsAt: grace ? EXISTING_ROUTER_GRACE_END.toISOString() : null,
  };
}
