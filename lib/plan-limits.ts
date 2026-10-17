// Owner-approved plan limits (2026 restructure, "FEAT-PLAN-LIMITS"; updated
// for the Free-trial restructure, FEAT-FREE-TRIAL).
// basic ("Solo" $9) / pro ("Growth" $19) / ultimate ("Agency" $49) are the
// only plans a customer can buy. "business" ($149) is no longer sold — any
// existing business user is mapped onto ultimate's numbers everywhere in
// this file.
//
// "free" is NOT a sellable plan. It is the internal key for "no paid plan
// and no active Free trial" (trial ended, never trialled, refunded, or paid
// plan expired). In that state EVERY limit below is 0 and nothing is
// grandfathered: 0 rotators, 0 numbers per rotator, 0 short links, 0 ad
// links, no widget, no reports, and no routed leads at all (see
// lib/router-entitlements.ts routerQuota). Every new sign-up instead gets a
// one-time 3-day Free trial with exactly Solo's limits (resolved to "basic"
// by lib/entitlements.ts effectivePlan / lib/router-entitlements.ts
// linkPlan) plus unlimited routed leads while it lasts — it never reads the
// free column below.
//
// lib/plan-limit-sync.ts (the billing pause engine) reads ROTATOR_LIMITS/
// SHORT_LINK_LIMITS/AD_LINK_LIMITS from here directly (FEAT-AUDIT-HARDENING).
// It is triggered not only on real downgrades but also on plain renewal
// charges and admin re-activation of the SAME plan (see
// lib/payment-integrity.ts recordVerifiedCharge, and app/api/admin/activate),
// so feeding it these numbers unconditionally would risk retroactively
// pausing rotators/short links/ad links an existing paying customer already
// had, with no plan change at all. That risk is closed at the trigger level
// instead: the engine only ever PAUSES these three when it can verify, from
// the previous plan passed in by the caller, that the user's plan rank
// (free < basic < pro < ultimate) actually went down, OR that the user now
// resolves to free (no paid plan, no active trial) — in that state pausing
// is always allowed, since every free limit is 0 and nothing is
// grandfathered, regardless of how the user arrived there. A renewal, an
// upgrade, a same-plan admin re-activation, or an unresolvable previous plan
// (while still on a paid/trial plan) all skip pausing (resume still runs
// normally) — see lib/plan-limit-sync.ts.

export type PlanKey = "free" | "basic" | "pro" | "ultimate";
const PLAN_KEYS: PlanKey[] = ["free", "basic", "pro", "ultimate"];

export function normalizePlanKey(plan: string | null | undefined): PlanKey {
  const key = (plan || "free").toLowerCase();
  const mapped = key === "business" ? "ultimate" : key;
  return (PLAN_KEYS as string[]).includes(mapped) ? (mapped as PlanKey) : "free";
}

// Key-only fallback label. "free" is never a plan the customer chose, and
// the bare word "Free" must never be shown as a plan name anywhere
// user-facing (owner rule). When a user record is available, prefer
// lib/entitlements.ts accountPlanLabel(user), which correctly says
// "Free trial" (active) vs "Free trial ended" (lapsed/never trialled).
// This fallback is used only where no user record is at hand.
export const PLAN_DISPLAY_NAME: Record<PlanKey, string> = {
  free: "Free trial ended",
  basic: "Solo",
  pro: "Growth",
  ultimate: "Agency",
};

// Rotator links (lead-routing pages) a user may have active at once.
export const ROTATOR_LIMITS: Record<PlanKey, number> = { free: 0, basic: 3, pro: 10, ultimate: 25 };

// Numbers (salespeople) allowed per rotator.
export const NUMBERS_PER_ROTATOR_LIMITS: Record<PlanKey, number> = { free: 0, basic: 3, pro: 10, ultimate: 20 };

// Routed leads: unlimited on every paid plan and during an active Free
// trial; zero (blocked) for free/no-trial — see
// lib/router-entitlements.ts routerQuota. Not duplicated here.

// Branded short links.
export const SHORT_LINK_LIMITS: Record<PlanKey, number> = { free: 0, basic: 2, pro: 5, ultimate: 15 };

// Ad-builder tracked links.
export const AD_LINK_LIMITS: Record<PlanKey, number> = { free: 0, basic: 0, pro: 5, ultimate: 15 };

export const WIDGET_AVAILABLE: Record<PlanKey, boolean> = { free: false, basic: true, pro: true, ultimate: true };

export type ReportsTier = "none" | "basic" | "full";
export const REPORTS_TIER: Record<PlanKey, ReportsTier> = { free: "none", basic: "basic", pro: "full", ultimate: "full" };

export type TrackingAvailability = "unavailable" | "coming_soon";
export const LOCATION_DEVICE_TRACKING: Record<PlanKey, TrackingAvailability> = {
  free: "unavailable",
  basic: "unavailable",
  pro: "coming_soon",
  ultimate: "coming_soon",
};

export const SUPPORT_LABEL: Record<PlanKey, string> = { free: "Basic", basic: "Basic", pro: "Standard", ultimate: "Priority" };

export function rotatorLimit(plan: string | null | undefined): number {
  return ROTATOR_LIMITS[normalizePlanKey(plan)];
}
export function numbersPerRotatorLimit(plan: string | null | undefined): number {
  return NUMBERS_PER_ROTATOR_LIMITS[normalizePlanKey(plan)];
}
export function shortLinkLimit(plan: string | null | undefined): number {
  return SHORT_LINK_LIMITS[normalizePlanKey(plan)];
}
export function adLinkLimit(plan: string | null | undefined): number {
  return AD_LINK_LIMITS[normalizePlanKey(plan)];
}
export function widgetAvailable(plan: string | null | undefined): boolean {
  return WIDGET_AVAILABLE[normalizePlanKey(plan)];
}
export function reportsTier(plan: string | null | undefined): ReportsTier {
  return REPORTS_TIER[normalizePlanKey(plan)];
}
export function supportLabel(plan: string | null | undefined): string {
  return SUPPORT_LABEL[normalizePlanKey(plan)];
}

// Grandfathering rule #1 (counts: rotators / short links / ad links): only
// blocks CREATING a new item once the current count is already at/over the
// limit. Existing items over the limit are never touched here.
export function canCreateMore(currentCount: number, limit: number): boolean {
  return currentCount < limit;
}

// Grandfathering rule #2 (numbers per rotator): a PATCH that keeps the
// number count the same or reduces it is always allowed, even if the
// rotator already has more numbers than the plan allows (e.g. a legacy
// rotator with 14 numbers on a plan now capped at 3). Only an increase that
// would cross the limit is blocked.
export function numbersPatchAllowed(previousCount: number, nextCount: number, limit: number): boolean {
  if (nextCount <= previousCount) return true;
  return nextCount <= limit;
}

export function upgradeHint(plan: string | null | undefined): string {
  const key = normalizePlanKey(plan);
  if (key === "ultimate") return "";
  if (key === "free") return "Choose a plan to turn your links back on.";
  const next = key === "basic" ? "Growth" : "Agency";
  return `Upgrade to ${next} for more.`;
}
