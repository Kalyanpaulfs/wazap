import type { PlanEntitlementUser } from "./entitlements";
import { isPlanExpired } from "./billing";

export const FREE_ROUTED_LEADS_LIFETIME = 25;
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

export function hasLegacyRouterGrace(user: RouterEntitlementUser | null | undefined, now = new Date()) {
  if (!user?.createdAt) return false;
  return new Date(user.createdAt) < ROUTER_METERING_LAUNCHED_AT && now < EXISTING_ROUTER_GRACE_END;
}

export function routerQuota(user: RouterEntitlementUser | null | undefined, used: number, now = new Date()) {
  const plan = routerPlan(user);
  const paid = plan !== "free";
  const grace = !paid && hasLegacyRouterGrace(user, now);
  return {
    plan,
    limit: paid || grace ? null : FREE_ROUTED_LEADS_LIFETIME,
    used,
    remaining: paid || grace ? null : Math.max(0, FREE_ROUTED_LEADS_LIFETIME - used),
    allowed: paid || grace || used < FREE_ROUTED_LEADS_LIFETIME,
    grace,
    graceEndsAt: grace ? EXISTING_ROUTER_GRACE_END.toISOString() : null,
  };
}
