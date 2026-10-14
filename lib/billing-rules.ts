// Pure billing decision rules (spec 12f). No DB, no network: every input is
// passed in, every output is a plain value, so this is fully unit-testable.

export const PLAN_RANK: Record<string, number> = {
  free: 0,
  basic: 1,
  pro: 2,
  ultimate: 3,
  business: 4,
};

export type PlanChangeDecision = "checkout" | "upgrade" | "downgrade" | "renew" | "blocked_autorenew" | "invalid";

export function decidePlanChange(opts: {
  currentPlan: string;
  accessActive: boolean;
  hasLiveSubscription: boolean;
  autoRenew: boolean;
  targetPlan: string;
}): PlanChangeDecision {
  const targetRank = PLAN_RANK[opts.targetPlan];
  if (targetRank == null || opts.targetPlan === "free") return "invalid";

  // No live subscription (or access has lapsed): this is a fresh checkout.
  if (!opts.hasLiveSubscription || !opts.accessActive) return "checkout";

  const currentRank = PLAN_RANK[opts.currentPlan] ?? 0;
  if (targetRank > currentRank) return "upgrade";
  if (targetRank < currentRank) return "downgrade";
  // Same plan again.
  return opts.autoRenew ? "blocked_autorenew" : "renew";
}

export const REFUND_WINDOW_HOURS = 48;

export function canRefund(opts: {
  paymentCreatedAt: Date;
  status: string;
  method: string;
  alreadyRefunded: boolean;
  now: Date;
}): { ok: boolean; reason: string } {
  if (opts.method !== "paypal" && opts.method !== "dodo") return { ok: false, reason: "unsupported_method" };
  if (opts.alreadyRefunded || opts.status === "refunded") return { ok: false, reason: "already_refunded" };
  if (opts.status !== "active") return { ok: false, reason: "not_active" };
  const hours = (opts.now.getTime() - opts.paymentCreatedAt.getTime()) / 3_600_000;
  if (hours > REFUND_WINDOW_HOURS) return { ok: false, reason: "window_closed" };
  return { ok: true, reason: "ok" };
}

export type IncomingChargeClassification = "same" | "expected_change" | "duplicate" | "first";

// The pending change is checked first: by the time its first charge arrives
// the pointer may already be on the new subscription (PayPal ACTIVATED came
// first) or the old one may already be cancelled (scheduled downgrade), and
// either way the change must still complete. Dodo changes plans in place
// (old === new subscription), so the plan must match too.
export function classifyIncomingCharge(opts: {
  pointerSubscriptionId: string | null;
  pointerLive: boolean;
  incomingSubscriptionId: string;
  incomingPlan?: string;
  pendingChange: { newSubscriptionId: string | null; oldSubscriptionId: string | null; toPlan?: string } | null;
}): IncomingChargeClassification {
  const change = opts.pendingChange;
  if (change && change.newSubscriptionId === opts.incomingSubscriptionId && (change.toPlan === undefined || change.toPlan === opts.incomingPlan)) return "expected_change";
  if (!opts.pointerSubscriptionId || !opts.pointerLive) return "first";
  if (opts.pointerSubscriptionId === opts.incomingSubscriptionId) return "same";
  return "duplicate";
}

// Shared access decision for both an admin/duplicate refund (applyLocalRefund)
// and a provider refund/chargeback webhook (applyVerifiedReversal): does
// losing this specific subscription's charge end the user's current paid
// access, or does another still-live subscription already cover them?
export function decideAccessAfterRefund(opts: {
  refundedSubscriptionId: string | null;
  pointerSubscriptionId: string | null;
  pointerLive: boolean;
  // A later, still-paid charge exists (e.g. an older month was refunded).
  newerChargeExists?: boolean;
  // The user is still on the plan this payment bought. If not (e.g. an admin
  // or a later change moved them), the refund doesn't touch their access.
  planMatches?: boolean;
}): boolean {
  if (opts.newerChargeExists) return false;
  if (opts.planMatches === false) return false;
  if (opts.pointerSubscriptionId && opts.refundedSubscriptionId && opts.pointerSubscriptionId !== opts.refundedSubscriptionId && opts.pointerLive) {
    return false;
  }
  return true;
}

// A plan change's "current billing period end" (spec 12f / 12c.2): prefer the
// provider's own period end; fall back to the locally recorded plan expiry
// minus the grace days added on top of it (lib/billing.ts withGrace), since
// that grace is not part of the real provider period. Used for a scheduled
// downgrade's effectiveAt and for an auto-pay-on renewal's PayPal startTime.
export function periodEndFromExpiry(planExpiresAt: Date | null | undefined, graceDays: number): Date | null {
  if (!planExpiresAt || !Number.isFinite(planExpiresAt.getTime())) return null;
  return new Date(planExpiresAt.getTime() - graceDays * 86_400_000);
}

export function isFutureDate(date: Date | null | undefined, now: Date): boolean {
  return Boolean(date && Number.isFinite(date.getTime()) && date.getTime() > now.getTime());
}

// Picks the effective date for a scheduled plan change: the provider's own
// period end when it is known and still in the future, otherwise the local
// fallback (also required to be in the future). Returns null when neither
// source gives a usable future date, so the caller can refuse the change
// instead of scheduling it for a date already in the past.
export function computeScheduledEffectiveAt(opts: {
  providerPeriodEnd: Date | null | undefined;
  fallbackPlanExpiresAt: Date | null | undefined;
  graceDays: number;
  now: Date;
}): Date | null {
  if (isFutureDate(opts.providerPeriodEnd, opts.now)) return opts.providerPeriodEnd as Date;
  const fallback = periodEndFromExpiry(opts.fallbackPlanExpiresAt, opts.graceDays);
  if (isFutureDate(fallback, opts.now)) return fallback;
  return null;
}

// Spec 12f: only one pending BillingPlanChange per user. A pending row older
// than an hour whose new subscription was never approved (no Payment row
// ever reached subscription_active for it) is abandoned - the buyer closed
// the checkout tab - and can be superseded. `newSubscriptionWasApproved` is
// looked up by the caller (it needs the DB); this function is the pure
// staleness rule so it can be unit-tested without a database.
export const PENDING_PLAN_CHANGE_STALE_MS = 60 * 60_000;

export function isStalePendingChange(opts: {
  createdAt: Date;
  now: Date;
  newSubscriptionWasApproved: boolean;
}): boolean {
  if (opts.newSubscriptionWasApproved) return false;
  return opts.now.getTime() - opts.createdAt.getTime() > PENDING_PLAN_CHANGE_STALE_MS;
}
