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
// grandfathered: 0 links (of any type), 0 numbers per rotator, no widget,
// no reports, and no routed leads at all (see
// lib/router-entitlements.ts routerQuota). Every new sign-up instead gets a
// one-time 3-day Free trial with exactly Solo's limits (resolved to "basic"
// by lib/entitlements.ts effectivePlan / lib/router-entitlements.ts
// linkPlan) plus 100 routed leads (TRIAL_ROUTED_LEADS) while it lasts — it
// never reads the free column below.
//
// UX-1 step 1 (shared link pool): rotators, short links and ad links used
// to each have their own separate quota. They now share ONE pool -
// LINK_LIMITS - counted as any mix of RotatorLink + ShortLink + AdLink rows
// the user has (planPausedAt: null). Ad links are additionally gated by
// AD_LINKS_AVAILABLE: only on plans where that's true (Growth/Agency) do
// they count toward, or can be created into, the pool at all - on Solo
// they're simply not offered, pool room or not. See lib/link-pool.ts for
// the shared count + create-check used by the three create APIs.
//
// lib/plan-limit-sync.ts (the billing pause engine) reads LINK_LIMITS/
// AD_LINKS_AVAILABLE from here directly (FEAT-AUDIT-HARDENING, extended by
// UX-1). It is triggered not only on real downgrades but also on plain
// renewal charges and admin re-activation of the SAME plan (see
// lib/payment-integrity.ts recordVerifiedCharge, and app/api/admin/activate),
// so feeding it these numbers unconditionally would risk retroactively
// pausing links an existing paying customer already had, with no plan
// change at all. That risk is closed at the trigger level instead: the
// engine only ever PAUSES pool links when it can verify, from the previous
// plan passed in by the caller, that the user's plan rank (free < basic <
// pro < ultimate) actually went down, OR that the user now resolves to free
// (no paid plan, no active trial) — in that state pausing is always
// allowed, since every free limit is 0 and nothing is grandfathered,
// regardless of how the user arrived there. A renewal, an upgrade, a
// same-plan admin re-activation, or an unresolvable previous plan (while
// still on a paid/trial plan) all skip pausing (resume still runs normally)
// — see lib/plan-limit-sync.ts.

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

// Shared pool: lead rotators + brand (short) links + ad links, any mix, per
// user. See lib/link-pool.ts countLiveLinks.
export const LINK_LIMITS: Record<PlanKey, number> = { free: 0, basic: 5, pro: 20, ultimate: 55 };

// Numbers (salespeople) allowed per rotator.
export const NUMBERS_PER_ROTATOR_LIMITS: Record<PlanKey, number> = { free: 0, basic: 3, pro: 10, ultimate: 20 };

// Routed leads: unlimited on every paid plan, capped at 100
// (TRIAL_ROUTED_LEADS) during an active Free trial; zero (blocked) for
// free/no-trial — see lib/router-entitlements.ts routerQuota. Not
// duplicated here.

// Ad links: only offered on Growth/Agency. Where false, ad links neither
// count toward LINK_LIMITS nor can be created, regardless of pool room.
export const AD_LINKS_AVAILABLE: Record<PlanKey, boolean> = { free: false, basic: false, pro: true, ultimate: true };

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

export function linkLimit(plan: string | null | undefined): number {
  return LINK_LIMITS[normalizePlanKey(plan)];
}
export function numbersPerRotatorLimit(plan: string | null | undefined): number {
  return NUMBERS_PER_ROTATOR_LIMITS[normalizePlanKey(plan)];
}
export function adLinksAvailable(plan: string | null | undefined): boolean {
  return AD_LINKS_AVAILABLE[normalizePlanKey(plan)];
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

// Grandfathering rule #1 (counts: the shared link pool, or any other
// per-plan count): only blocks CREATING a new item once the current count
// is already at/over the limit. Existing items over the limit are never
// touched here.
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

// Next plan's name + its link pool total, e.g. "Growth for 20" / "Agency for
// 55" - "" on Agency (nothing higher) or free (upgradeHint/the free-specific
// copy covers that case instead). Shared by lib/link-pool.ts's create-check
// message and app/links/new (UX-1 step 2) so the two never drift.
export function nextPlanPoolHint(plan: string | null | undefined): string {
  const key = normalizePlanKey(plan);
  if (key === "basic") return `Growth for ${linkLimit("pro")}`;
  if (key === "pro") return `Agency for ${linkLimit("ultimate")}`;
  return "";
}

// Next plan's name + its numbers-per-rotator total, e.g. "Growth allows 10" /
// "Agency allows 20" - "" on Agency (nothing higher) or free. Mirrors
// nextPlanPoolHint's shape but for the numbers-per-rotator limit. Used by the
// in-app rotator create form's salespeople counter (UX-1 step 3).
export function nextPlanNumbersHint(plan: string | null | undefined): string {
  const key = normalizePlanKey(plan);
  if (key === "basic") return `Growth allows ${numbersPerRotatorLimit("pro")}`;
  if (key === "pro") return `Agency allows ${numbersPerRotatorLimit("ultimate")}`;
  return "";
}

export function upgradeHint(plan: string | null | undefined): string {
  const key = normalizePlanKey(plan);
  if (key === "ultimate") return "";
  if (key === "free") return "Choose a plan to turn your links back on.";
  const next = key === "basic" ? "Growth" : "Agency";
  return `Upgrade to ${next} for more.`;
}
